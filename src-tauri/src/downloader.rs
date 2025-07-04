// downloader.rs

use tauri::Emitter;

use anyhow::{Ok, Result};
use http_downloader::bson_file_archiver::{ArchiveFilePath, BsonFileArchiverBuilder};
use http_downloader::{
    breakpoint_resume::DownloadBreakpointResumeExtension,
    speed_limiter::DownloadSpeedLimiterExtension, speed_tracker::DownloadSpeedTrackerExtension,
    status_tracker::DownloadStatusTrackerExtension, HttpDownloaderBuilder,
};
use reqwest::header;
use serde::{Deserialize, Serialize};
use std::num::{NonZeroU8, NonZeroUsize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager; // 导入Manager以使用emit_to
use url::Url;
use urlencoding::decode;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadInfo {
    pub progress: String,
    pub speed: String,
    pub downloading: bool,
}

// 移除了 lazy_static! 和 DOWNLOAD_STATE

fn bytes_to_mb(bytes: u64) -> f64 {
    let mb = bytes as f64 / (1024.0 * 1024.0);
    (mb * 100.0).round() / 100.0
}

/// 从URL的响应头中提取文件名
async fn extract_filename(url: &Url) -> Result<String> {
    let client = reqwest::Client::new();
    let response = client.head(url.as_str()).send().await?;

    if let Some(content_disposition) = response.headers().get(header::CONTENT_DISPOSITION) {
        if let std::result::Result::Ok(cd) = content_disposition.to_str() {
            if let Some(name) = parse_content_disposition(cd) {
                return Ok(decode(&name).unwrap().to_string());
            }
        }
    }

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

// 移除了 start_download_server 函数
// 移除了 update_download_state 函数

/// 下载文件到指定路径
pub async fn download_file_with_progress(
    app: tauri::AppHandle, // 新增 app: tauri::AppHandle 参数
    url: String,
    save_path: String,
    thread: u8,
) -> Result<String> {
    let url = Url::parse(&url)?;
    let save_path = PathBuf::from(&save_path);

    if let Some(parent) = save_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let filename = if save_path.is_dir() {
        extract_filename(&url).await?
    } else {
        save_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    };

    let final_save_path = if save_path.is_dir() {
        save_path.join(&filename)
    } else {
        save_path
    };

    let save_dir = final_save_path.parent().unwrap().to_path_buf();

    // 下载开始时，立即发送一个事件
    let initial_info = DownloadInfo {
        progress: "0%".to_string(),
        speed: "0.00MB/s".to_string(),
        downloading: true,
    };
    if let Err(e) = app.emit_to("main", "download://progress", &initial_info) {
        println!("[ERROR] Failed to emit initial progress event: {}", e);
    }

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
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

    let monitor_handle = tokio::spawn({
        let main_window = app.get_webview_window("main").unwrap();
        let mut downloaded_len_receiver = downloader.downloaded_len_receiver().clone();
        let total_size_future = downloader.total_size_future();
        let _speed_receiver = _speed_state.receiver;

        async move {
            let total_len = total_size_future.await;

            loop {
                tokio::select! {
                    result = downloaded_len_receiver.changed() => {
                        if result.is_err() { break; }

                        let progress = *downloaded_len_receiver.borrow();
                        let speed = bytes_to_mb(*_speed_receiver.borrow());

                        if let Some(total_len) = total_len {
                            let total_len_value = total_len.get();
                            let progress_percent = if total_len_value > 0 {
                                (progress * 100 / total_len_value).min(100)
                            } else { 0 };

                            // 使用事件发送下载状态
                            let info = DownloadInfo {
                                progress: format!("{}%", progress_percent),
                                speed: format!("{:.2}MB/s", speed),
                                downloading: true,
                            };
                            if let Err(e) = main_window.emit("download://progress", &info) {
                               eprintln!("[ERROR] Failed to emit progress event: {}", e);
                            }

                            println!(
                                "\r\x1B[K[INFO] 速度: {:.2}MB/s 进度: {}%",
                                speed, progress_percent
                            );
                        }
                    }
                    _ = &mut cancel_rx => { break; }
                }
                tokio::time::sleep(Duration::from_millis(1000)).await;
            }
        }
    });

    let result = download_future.await;
    let _ = cancel_tx.send(());
    let _ = monitor_handle.await;

    // 下载完成或失败后，发送最终状态事件
    let final_info = match &result {
        std::result::Result::Ok(_) => {
            println!("\n[INFO] 下载完成");
            DownloadInfo {
                progress: "100%".to_string(),
                speed: "0.00MB/s".to_string(),
                downloading: false,
            }
        }
        Err(e) => {
            println!("\n[ERROR] 下载失败: {}", e);
            DownloadInfo {
                progress: "0%".to_string(),
                speed: "0.00MB/s".to_string(),
                downloading: false,
            }
        }
    };
    if let Err(e) = app.emit_to("main", "download://progress", &final_info) {
        eprintln!("[ERROR] Failed to emit final progress event: {}", e);
    }

    result?;

    let bson_file = format!("{}.bson", downloader.get_file_path().display());
    if Path::new(&bson_file).exists() {
        let _ = std::fs::remove_file(&bson_file);
    }

    Ok(downloader.get_file_path().display().to_string())
}