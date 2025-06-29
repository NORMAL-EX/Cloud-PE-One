use anyhow::{Ok, Result};
use http_downloader::bson_file_archiver::{ArchiveFilePath, BsonFileArchiverBuilder};
use http_downloader::{
    breakpoint_resume::DownloadBreakpointResumeExtension,
    speed_limiter::DownloadSpeedLimiterExtension, 
    speed_tracker::DownloadSpeedTrackerExtension,
    status_tracker::DownloadStatusTrackerExtension, 
    HttpDownloaderBuilder,
};
use reqwest::header;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Write;
use std::num::{NonZeroU8, NonZeroUsize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::watch;
use url::Url;
use urlencoding::decode;
use warp::Filter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadInfo {
    pub progress: String,
    pub speed: String,
    pub downloading: bool,
}

impl Default for DownloadInfo {
    fn default() -> Self {
        Self {
            progress: "0%".to_string(),
            speed: "0.00MB/s".to_string(),
            downloading: false,
        }
    }
}

// 全局下载状态
lazy_static::lazy_static! {
    static ref DOWNLOAD_STATE: Arc<Mutex<DownloadInfo>> = Arc::new(Mutex::new(DownloadInfo::default()));
}

fn bytes_to_mb(bytes: u64) -> f64 {
    let mb = bytes as f64 / (1024.0 * 1024.0);
    (mb * 100.0).round() / 100.0
}

/// 从URL的响应头中提取文件名
async fn extract_filename(url: &Url) -> Result<String> {
    let client = reqwest::Client::new();
    let response = client.head(url.as_str()).send().await?;

    // 尝试从Content-Disposition头解析
    if let Some(content_disposition) = response.headers().get(header::CONTENT_DISPOSITION) {
        if let std::result::Result::Ok(cd) = content_disposition.to_str() {
            if let Some(name) = parse_content_disposition(cd) {
                return Ok(decode(&name).unwrap().to_string());
            }
        }
    }

    // 从URL路径最后一段获取文件名
    Ok(url
        .path_segments()
        .and_then(|segments| segments.last())
        .unwrap_or("unknown_file")
        .to_string())
}

/// 解析Content-Disposition头中的文件名
fn parse_content_disposition(cd: &str) -> Option<String> {
    cd.split("filename=")
        .nth(1)
        .and_then(|s| {
            let s = s.trim().trim_matches('"').trim_matches('\'');
            s.split(';').next().map(|s| s.to_string())
        })
        .filter(|s| !s.is_empty())
}

/// 启动HTTP服务器
pub async fn start_download_server() -> Result<()> {
    let download_info = warp::path("getDownloaderInfo")
        .and(warp::get())
        .map(|| {
            let state = DOWNLOAD_STATE.lock().unwrap();
            warp::reply::json(&*state)
        });

    let cors = warp::cors()
        .allow_any_origin()
        .allow_headers(vec!["content-type"])
        .allow_methods(vec!["GET", "POST", "DELETE"]);

    let routes = download_info.with(cors);

    println!("[INFO] 下载状态服务器启动: http://127.0.0.1:3458");
    
    warp::serve(routes)
        .run(([127, 0, 0, 1], 3458))
        .await;
    
    Ok(())
}

/// 更新下载状态
fn update_download_state(progress: String, speed: String, downloading: bool) {
    if let std::result::Result::Ok(mut state) = DOWNLOAD_STATE.lock() {
        state.progress = progress;
        state.speed = speed;
        state.downloading = downloading;
    }
}

/// 下载文件到指定路径
pub async fn download_file_with_progress(
    url: String,
    save_path: String,
    thread: u8,
) -> Result<String> {
    // 解析URL
    let url = Url::parse(&url)?;
    let save_path = PathBuf::from(&save_path);
    
    // 确保保存目录存在
    if let Some(parent) = save_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    // 获取文件名
    let filename = if save_path.is_dir() {
        extract_filename(&url).await?
    } else {
        save_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    };

    // 确定最终保存路径
    let final_save_path = if save_path.is_dir() {
        save_path.join(&filename)
    } else {
        save_path
    };

    let save_dir = final_save_path.parent().unwrap().to_path_buf();

    // 设置下载状态为开始
    update_download_state("0%".to_string(), "0.00MB/s".to_string(), true);

    // 构建下载器
    let (mut downloader, (_status_state, _speed_state, _speed_limiter, ..)) =
        HttpDownloaderBuilder::new(url, save_dir.clone())
            .chunk_size(NonZeroUsize::new(1024 * 1024 * 10).unwrap())
            .download_connection_count(NonZeroU8::new(thread.max(1).min(64)).unwrap())
            .file_name(Some(filename.clone()))
            .build((
                DownloadStatusTrackerExtension { log: true },
                DownloadSpeedTrackerExtension { log: true },
                DownloadSpeedLimiterExtension::new(None),
                DownloadBreakpointResumeExtension {
                    download_archiver_builder: BsonFileArchiverBuilder::new(
                        ArchiveFilePath::Suffix("bson".to_string()),
                    ),
                },
            ));

    let download_future = downloader.prepare_download()?;

    // 创建一个取消信号
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

    // 启动进度监控任务
    let monitor_handle = tokio::spawn({
        let mut downloaded_len_receiver = downloader.downloaded_len_receiver().clone();
        let total_size_future = downloader.total_size_future();
        let _speed_receiver = _speed_state.receiver;
        
        async move {
            let total_len = total_size_future.await;

            loop {
                tokio::select! {
                    // 监听下载进度变化
                    result = downloaded_len_receiver.changed() => {
                        if result.is_err() {
                            break;
                        }
                        
                        let progress = *downloaded_len_receiver.borrow();
                        let speed = bytes_to_mb(*_speed_receiver.borrow());
                        
                        if let Some(total_len) = total_len {
                            let total_len_value = total_len.get();
                            let progress_percent = if total_len_value > 0 {
                                (progress * 100 / total_len_value).min(100)
                            } else {
                                0
                            };
                            
                            // 更新全局状态
                            update_download_state(
                                format!("{}%", progress_percent),
                                format!("{:.2}MB/s", speed),
                                true,
                            );
                            
                            println!(
                                "\r\x1B[K[INFO] 速度: {:.2}MB/s 进度: {}%",
                                speed, progress_percent
                            );
                        }
                    }
                    // 监听取消信号
                    _ = &mut cancel_rx => {
                        break;
                    }
                }

                tokio::time::sleep(Duration::from_millis(1000)).await;
            }
        }
    });

    // 等待下载完成
    let result = download_future.await;

    // 发送取消信号停止监控任务
    let _ = cancel_tx.send(());
    
    // 等待监控任务结束
    let _ = monitor_handle.await;

    // 下载完成，更新状态
    match &result {
        std::result::Result::Ok(_) => {
            update_download_state("100%".to_string(), "0.00MB/s".to_string(), false);
            println!("\n[INFO] 下载完成");
            
            // 保持完成状态3秒后恢复默认状态
            tokio::spawn(async {
                tokio::time::sleep(Duration::from_secs(3)).await;
                update_download_state("0%".to_string(), "0.00MB/s".to_string(), false);
            });
        }
        Err(e) => {
            update_download_state("0%".to_string(), "0.00MB/s".to_string(), false);
            println!("\n[ERROR] 下载失败: {}", e);
        }
    }

    result?;

    // 清理临时文件
    let bson_file = format!("{}.bson", downloader.get_file_path().display());
    if Path::new(&bson_file).exists() {
        let _ = std::fs::remove_file(&bson_file);
    }

    Ok(downloader.get_file_path().display().to_string())
}