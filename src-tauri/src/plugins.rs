// src-tauri/src/plugins.rs

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::command;
use tokio::time::Duration;
use url::Url;

// 下载状态结构体
#[derive(Clone, Serialize, Deserialize)]
pub struct DownloadStatus {
    progress: u64,
    speed: String,
}

// 插件信息结构体
#[derive(Clone, Serialize, Deserialize)]
pub struct PluginInfo {
    name: String,
    size: String,
    version: String,
    author: String,
    describe: String,
    file: String,
}

// 全局下载状态
lazy_static::lazy_static! {
    static ref DOWNLOAD_STATUS: Arc<Mutex<Option<DownloadStatus>>> = Arc::new(Mutex::new(None));
}

// 从URL的响应头中提取文件名
async fn extract_filename(url: &Url) -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let response = client.head(url.as_str()).send().await?;

    // 尝试从Content-Disposition头解析
    if let Some(content_disposition) = response.headers().get(reqwest::header::CONTENT_DISPOSITION)
    {
        if let Ok(cd) = content_disposition.to_str() {
            if let Some(name) = parse_content_disposition(cd) {
                return Ok(urlencoding::decode(&name)?.to_string());
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

// 解析Content-Disposition头中的文件名
fn parse_content_disposition(cd: &str) -> Option<String> {
    cd.split("filename=")
        .nth(1)
        .and_then(|s| {
            let s = s.trim().trim_matches('"').trim_matches('\'');
            s.split(';').next().map(|s| s.to_string())
        })
        .filter(|s| !s.is_empty())
}

// 下载插件，支持线程数参数
#[command]
pub async fn download_plugin(
    url: String,
    path: String,
    file_name: Option<String>,
    threads: Option<u32>, // 添加线程数参数
) -> Result<String, String> {
    // 使用提供的线程数或默认值
    let thread_count = threads.unwrap_or(8);

    // 重置下载状态
    {
        let mut status = DOWNLOAD_STATUS.lock().unwrap();
        *status = Some(DownloadStatus {
            progress: 0,
            speed: "0.00".to_string(),
        });
    }

    // 解析URL
    let url = Url::parse(&url).map_err(|e| e.to_string())?;

    // 确保下载目录存在
    let download_dir = Path::new(&path);
    if !download_dir.exists() {
        fs::create_dir_all(download_dir).map_err(|e| e.to_string())?;
    }

    // 确定文件名
    let file_name = if let Some(name) = file_name {
        name
    } else {
        extract_filename(&url).await.map_err(|e| e.to_string())?
    };

    // 构建完整的文件路径
    let file_path = download_dir.join(&file_name);

    // 创建HTTP客户端
    let client = reqwest::Client::new();

    // 获取文件大小
    let response = client
        .head(url.as_str())
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let total_size = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|ct_len| ct_len.to_str().ok())
        .and_then(|ct_len| ct_len.parse::<u64>().ok())
        .unwrap_or(0);

    // 如果文件大小为0或无法确定，使用单线程下载
    if total_size == 0 {
        return download_single_thread(url.as_str(), &file_path, total_size).await;
    }

    // 使用多线程下载
    download_multi_thread(url.as_str(), &file_path, total_size, thread_count as usize).await
}

// 单线程下载
async fn download_single_thread(
    url: &str,
    file_path: &Path,
    total_size: u64,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    let mut file = File::create(file_path).map_err(|e| e.to_string())?;
    let downloaded = Arc::new(Mutex::new(0u64)); // 使用原子引用计数
    let mut stream = response.bytes_stream();

    // 创建状态监控线程
    let downloaded_clone = Arc::clone(&downloaded);
    let status_updater = tokio::spawn(async move {
        let mut last_downloaded = 0u64;
        let mut last_time = std::time::Instant::now();

        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            let current_downloaded = *downloaded_clone.lock().unwrap();
            let current_time = std::time::Instant::now();
            let elapsed = current_time.duration_since(last_time).as_secs_f64();

            if elapsed > 0.0 {
                let speed =
                    (current_downloaded - last_downloaded) as f64 / elapsed / 1024.0 / 1024.0;
                let progress = if total_size > 0 {
                    (current_downloaded * 100) / total_size
                } else {
                    0
                };

                // 更新全局状态（使用小作用域）
                {
                    let mut status = DOWNLOAD_STATUS.lock().unwrap();
                    *status = Some(DownloadStatus {
                        progress,
                        speed: format!("{:.2}", speed),
                    });
                }

                last_downloaded = current_downloaded;
                last_time = current_time;
            }
        }
    });

    // 下载文件
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;

        let mut downloaded_guard = downloaded.lock().unwrap();
        *downloaded_guard += chunk.len() as u64;
    }

    // 下载完成，更新状态为100%
    {
        let mut status = DOWNLOAD_STATUS.lock().unwrap();
        *status = Some(DownloadStatus {
            progress: 100,
            speed: "0.00".to_string(),
        });
    }

    // 取消状态监控线程
    status_updater.abort();

    Ok(file_path.to_string_lossy().to_string())
}

// 多线程下载
async fn download_multi_thread(
    url: &str,
    file_path: &Path,
    total_size: u64,
    thread_count: usize,
) -> Result<String, String> {
    // 创建临时目录存放分片
    let temp_dir = file_path.with_extension("tmp");
    if temp_dir.exists() {
        fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // 计算每个线程下载的大小
    let chunk_size = total_size / thread_count as u64;
    let mut handles = vec![];
    let client = reqwest::Client::new();

    // 创建共享的下载进度
    let downloaded = Arc::new(Mutex::new(0u64));

    // 启动状态监控线程
    let downloaded_clone = Arc::clone(&downloaded);
    let status_updater = tokio::spawn(async move {
        let mut last_downloaded = 0u64;
        let mut last_time = std::time::Instant::now();

        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            let current_downloaded = *downloaded_clone.lock().unwrap();
            let current_time = std::time::Instant::now();
            let elapsed = current_time.duration_since(last_time).as_secs_f64();

            if elapsed > 0.0 {
                let speed =
                    (current_downloaded - last_downloaded) as f64 / elapsed / 1024.0 / 1024.0;
                let progress = if total_size > 0 {
                    (current_downloaded * 100) / total_size
                } else {
                    0
                };

                // 更新全局状态（使用小作用域）
                {
                    let mut status = DOWNLOAD_STATUS.lock().unwrap();
                    *status = Some(DownloadStatus {
                        progress,
                        speed: format!("{:.2}", speed),
                    });
                }

                last_downloaded = current_downloaded;
                last_time = current_time;
            }
        }
    });

    // 启动下载线程
    for i in 0..thread_count {
        let start = i as u64 * chunk_size;
        let end = if i == thread_count - 1 {
            total_size
        } else {
            (i as u64 + 1) * chunk_size - 1
        };

        let client = client.clone();
        let url = url.to_string();
        let temp_file = temp_dir.join(format!("part_{}", i));
        let downloaded = Arc::clone(&downloaded);

        let handle = tokio::spawn(async move {
            let mut file = File::create(&temp_file).map_err(|e| e.to_string())?;
            let response = client
                .get(&url)
                .header("Range", format!("bytes={}-{}", start, end))
                .send()
                .await
                .map_err(|e| e.to_string())?;

            let mut stream = response.bytes_stream();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| e.to_string())?;
                file.write_all(&chunk).map_err(|e| e.to_string())?;

                let mut downloaded_guard = downloaded.lock().unwrap();
                *downloaded_guard += chunk.len() as u64;
            }

            Ok::<_, String>(())
        });

        handles.push(handle);
    }

    // 等待所有线程完成
    for handle in handles {
        handle.await.map_err(|e| e.to_string())??;
    }

    // 合并文件
    let mut output_file = File::create(file_path).map_err(|e| e.to_string())?;
    for i in 0..thread_count {
        let part_file = temp_dir.join(format!("part_{}", i));
        let content = fs::read(&part_file).map_err(|e| e.to_string())?;
        output_file.write_all(&content).map_err(|e| e.to_string())?;
    }

    // 清理临时文件
    fs::remove_dir_all(&temp_dir).map_err(|e| e.to_string())?;

    // 下载完成，更新状态为100%
    {
        let mut status = DOWNLOAD_STATUS.lock().unwrap();
        *status = Some(DownloadStatus {
            progress: 100,
            speed: "0.00".to_string(),
        });
    }

    // 取消状态监控线程
    status_updater.abort();

    Ok(file_path.to_string_lossy().to_string())
}

// 获取插件下载状态
#[command]
pub fn get_plugin_download_status() -> Option<DownloadStatus> {
    DOWNLOAD_STATUS.lock().unwrap().clone()
}

// 获取插件文件列表
#[command]
pub fn get_plugin_files(drive_letter: String) -> Result<HashMap<String, Vec<PluginInfo>>, String> {
    let ce_apps_dir = format!("{}\\ce-apps", drive_letter);
    let dir_path = Path::new(&ce_apps_dir);

    if !dir_path.exists() {
        return Err(format!("目录 {} 不存在", ce_apps_dir));
    }

    let mut enabled_plugins = Vec::new();
    let mut disabled_plugins = Vec::new();

    let entries = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() {
            if let Some(extension) = path.extension() {
                let extension_str = extension.to_string_lossy().to_lowercase();

                if extension_str == "ce" || extension_str == "cbk" {
                    let file_name = path.file_name().unwrap().to_string_lossy().to_string();
                    let parts: Vec<&str> = file_name.split('_').collect();

                    if parts.len() >= 4 {
                        let name = parts[0].to_string();
                        let version = parts[1].to_string();
                        let author = parts[2].to_string();

                        // 获取描述（最后一部分，去掉扩展名）
                        let describe_with_ext = parts[3..].join("_");
                        let describe = describe_with_ext
                            .strip_suffix(".ce")
                            .or_else(|| describe_with_ext.strip_suffix(".CBK"))
                            .unwrap_or(&describe_with_ext)
                            .to_string();

                        // 获取文件大小
                        let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
                        let size = format!("{:.2} MB", metadata.len() as f64 / 1024.0 / 1024.0);

                        let plugin_info = PluginInfo {
                            name,
                            size,
                            version,
                            author,
                            describe,
                            file: file_name,
                        };

                        if extension_str == "ce" {
                            enabled_plugins.push(plugin_info);
                        } else {
                            disabled_plugins.push(plugin_info);
                        }
                    }
                }
            }
        }
    }

    let mut result = HashMap::new();
    result.insert("enabled".to_string(), enabled_plugins);
    result.insert("disabled".to_string(), disabled_plugins);

    Ok(result)
}

// 启用插件
#[command]
pub fn enable_plugin(drive_letter: String, file_name: String) -> Result<bool, String> {
    let ce_apps_dir = format!("{}\\ce-apps", drive_letter);
    let dir_path = Path::new(&ce_apps_dir);

    if !dir_path.exists() {
        return Err(format!("目录 {} 不存在", ce_apps_dir));
    }

    let file_path = dir_path.join(&file_name);
    if !file_path.exists() {
        return Err(format!("文件 {} 不存在", file_name));
    }

    // 检查文件是否已经是.ce扩展名
    if let Some(extension) = file_path.extension() {
        if extension.to_string_lossy().to_lowercase() == "ce" {
            return Ok(true); // 已经是启用状态
        }
    }

    // 将.CBK扩展名改为.ce
    let new_file_name = file_name.replace(".CBK", ".ce");
    let new_file_path = dir_path.join(&new_file_name);

    fs::rename(&file_path, &new_file_path).map_err(|e| e.to_string())?;

    Ok(true)
}

// 禁用插件
#[command]
pub fn disable_plugin(drive_letter: String, file_name: String) -> Result<bool, String> {
    let ce_apps_dir = format!("{}\\ce-apps", drive_letter);
    let dir_path = Path::new(&ce_apps_dir);

    if !dir_path.exists() {
        return Err(format!("目录 {} 不存在", ce_apps_dir));
    }

    let file_path = dir_path.join(&file_name);
    if !file_path.exists() {
        return Err(format!("文件 {} 不存在", file_name));
    }

    // 检查文件是否已经是.CBK扩展名
    if let Some(extension) = file_path.extension() {
        if extension.to_string_lossy().to_lowercase() == "cbk" {
            return Ok(true); // 已经是禁用状态
        }
    }

    // 将.ce扩展名改为.CBK
    let new_file_name = file_name.replace(".ce", ".CBK");
    let new_file_path = dir_path.join(&new_file_name);

    fs::rename(&file_path, &new_file_path).map_err(|e| e.to_string())?;

    Ok(true)
}
