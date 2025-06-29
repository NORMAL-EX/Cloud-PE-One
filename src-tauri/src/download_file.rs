use anyhow::{Ok, Result};
use http_downloader::bson_file_archiver::{ArchiveFilePath, BsonFileArchiverBuilder};
use http_downloader::{
    breakpoint_resume::DownloadBreakpointResumeExtension,
    speed_limiter::DownloadSpeedLimiterExtension, speed_tracker::DownloadSpeedTrackerExtension,
    status_tracker::DownloadStatusTrackerExtension, HttpDownloaderBuilder,
};
use reqwest::header;
use urlencoding::decode;
use std::fs::File;
use std::io::Write;
use std::num::{NonZeroU8, NonZeroUsize};
use std::path::PathBuf;
use std::time::Duration;
use url::Url;

use std::io::{self};

fn bytes_to_mb(bytes: u64) -> f64 {
    let mb = bytes as f64 / (1024.0 * 1024.0);
    mb.round() as f64
}

/// 从URL的响应头中提取文件名
// 添加这一行

async fn extract_filename(url: &Url) -> Result<String> {
    let client = reqwest::Client::new();
    let response = client.head(url.as_str()).send().await?;

    // 尝试从Content-Disposition头解析
    if let Some(content_disposition) = response.headers().get(header::CONTENT_DISPOSITION) {
        if let std::result::Result::Ok(cd) = content_disposition.to_str() {
            if let Some(name) = parse_content_disposition(cd) {
                return Ok( decode(&name).unwrap().to_string());
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

pub(crate) async fn download_file(
    url: Url,
    save: PathBuf,  // 修改为保存目录
    thread: u8,
    write_progress: bool,
) -> Result<String> {
    // 第一次封装：获取文件名
    let filename = extract_filename(&url).await?;
    let save_path = save.join(&filename);

    // 构建下载器时注入提取到的文件名
    let (mut downloader, (_status_state, _speed_state, _speed_limiter, ..)) =
    HttpDownloaderBuilder::new(url, save)
            .chunk_size(NonZeroUsize::new(1024 * 1024 * 10).unwrap())
            .download_connection_count(NonZeroU8::new(thread).unwrap())
            .file_name(Some(filename))  // 设置动态获取的文件名
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
            // 等待下载完成
        
            tokio::spawn({
                let mut downloaded_len_receiver = downloader.downloaded_len_receiver().clone();
                let total_size_future = downloader.total_size_future();
                let path = "status.json";
                let _speed_receiver = _speed_state.receiver;
                async move {
                    let total_len = total_size_future.await;
        
                    while downloaded_len_receiver.changed().await.is_ok() {
                        let progress = *downloaded_len_receiver.borrow();
                        if let Some(total_len) = total_len {
                            if write_progress {
                                let mut file =  File::create(path).unwrap();
                                file.write_all(
                                    format!(
                                        r#"{{"progress":"{}%", "speed":"{:.2}MB/s"}}"#,
                                        progress * 100 / total_len,
                                        bytes_to_mb(*_speed_receiver.borrow()) as i64
                                    ).as_bytes()
                                )
                                .unwrap();
                            };
                            
                            print!("\r\x1B[K[INFO]速度:{}MB/s 进度:{}%", bytes_to_mb(*_speed_receiver.borrow()), (progress * 100 / total_len));
                            io::stdout().flush().unwrap();
                         }
        
                        tokio::time::sleep(Duration::from_millis(1000)).await;
                    }
                    File::open(path)
                        .unwrap()
                        .write_all("100 0.00".to_string().as_bytes())
                }
            });
            download_future.await?;

    Ok(downloader.get_file_path().display().to_string())
}