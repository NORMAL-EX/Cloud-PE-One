use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Manager};
use tokio::time::Duration;
use url::Url;

// 下载状态结构体
#[derive(Clone, Serialize, Deserialize)]
pub struct DownloadStatus {
    progress: u64,
    speed: String,
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

// 下载文件函数
async fn download_file(
    url: Url,
    save_dir: PathBuf,
    _thread_count: u8, // 添加下划线表示未使用
) -> Result<String, Box<dyn std::error::Error>> {
    // 确保目录存在
    if !save_dir.exists() {
        fs::create_dir_all(&save_dir)?;
    }

    // 获取文件名
    let filename = extract_filename(&url).await?;
    let save_path = save_dir.join(&filename);

    // 创建HTTP客户端
    let client = reqwest::Client::new();

    // 获取文件大小
    let response = client.head(url.as_str()).send().await?;
    let total_size = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|ct_len| ct_len.to_str().ok())
        .and_then(|ct_len| ct_len.parse::<u64>().ok())
        .unwrap_or(0);

    // 开始下载
    let response = client.get(url.as_str()).send().await?;
    let mut file = File::create(&save_path)?;
    let downloaded = Arc::new(Mutex::new(0u64)); // 使用原子引用计数
    let mut stream = response.bytes_stream();

    // 创建状态监控线程
    let status_updater = tokio::spawn({
        let downloaded_clone = Arc::clone(&downloaded);
        async move {
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
        }
    });

    // 下载文件
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        file.write_all(&chunk)?;
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

    Ok(save_path.to_string_lossy().to_string())
}

// 解压文件
fn extract_archive(
    archive_path: &str,
    extract_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    // 确保目录存在
    let extract_path = Path::new(extract_dir);
    if !extract_path.exists() {
        fs::create_dir_all(extract_path)?;
    }

    // 使用系统命令解压文件
    #[cfg(target_os = "windows")]
    {
        // Windows下使用PowerShell解压
        Command::new("powershell")
            .args(&[
                "-Command",
                &format!(
                    "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                    archive_path, extract_dir
                ),
            ])
            .output()?;
    }

    Ok(())
}

// 创建更新脚本
fn create_update_script(
    app_dir: &str,
    tmp_dir: &str,
    app_name: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    let script_path = Path::new(app_dir).join("tmpAppUpdata.bat");
    let mut script = File::create(&script_path)?;

    // 写入脚本内容
    #[cfg(target_os = "windows")]
    {
        writeln!(script, "@echo off")?;
        writeln!(script, "echo 升级中，请稍后...")?;
        writeln!(script, "timeout /t 1 /nobreak > nul")?;

        // 删除当前目录下除tmpAppUpdata.bat和tmpFile外的所有文件和文件夹
        writeln!(
            script,
            "for /d %%i in (*) do if not \"%%i\"==\"tmpFile\" rd /s /q \"%%i\""
        )?;
        writeln!(
            script,
            "for %%i in (*) do if not \"%%i\"==\"tmpAppUpdata.bat\" del \"%%i\""
        )?;

        // 移动tmpFile中的所有文件到当前目录
        writeln!(script, "xcopy /e /y \"{}\\*\" \"{}\\\"", tmp_dir, app_dir)?;

        // 删除临时文件夹
        writeln!(script, "rd /s /q \"{}\"", tmp_dir)?;

        // 启动新版本应用
        writeln!(script, "start \"\" \"{}\"", app_name)?;

        // 删除自身
        writeln!(script, "del \"%~f0\"")?;
    }

    Ok(script_path.to_string_lossy().to_string())
}

// Tauri命令：下载更新
#[command]
pub async fn download_update(
    app_handle: AppHandle,
    url: String,
    app_name: String,
) -> Result<String, String> {
    // 重置下载状态
    {
        let mut status = DOWNLOAD_STATUS.lock().unwrap();
        *status = Some(DownloadStatus {
            progress: 0,
            speed: "0.00".to_string(),
        });
    }

    // 获取应用数据目录
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("获取应用目录失败: {}", e))?;

    print!("APP DIR:{}",&app_dir.to_string_lossy());

    let app_dir_str = app_dir.to_string_lossy().to_string();

    // 创建临时目录路径
    let tmp_file_path = app_dir.join("tmp.01");
    let tmp_dir_path = app_dir.join("tmpFile");

    // 下载更新文件
    let download_result = download_file(
        Url::parse(&url).map_err(|e| e.to_string())?,
        app_dir.clone(),
        8, // 使用8个线程下载
    )
    .await
    .map_err(|e| e.to_string())?;

    print!("Update File:{}",&tmp_file_path.to_string_lossy());

    // 解压更新文件到临时目录
    extract_archive(
        &tmp_file_path.to_string_lossy(),
        &tmp_dir_path.to_string_lossy(),
    )
    .map_err(|e| e.to_string())?;

    // 删除下载的压缩包
   // fs::remove_file(&tmp_file_path).map_err(|e| e.to_string())?;

    // 创建更新脚本
    let script_path =
        create_update_script(&app_dir_str, &tmp_dir_path.to_string_lossy(), &app_name)
            .map_err(|e| e.to_string())?; // 添加错误转换

    Ok(script_path)
}

// Tauri命令：获取应用更新下载状态
#[command]
pub fn get_app_download_status() -> Option<DownloadStatus> {
    DOWNLOAD_STATUS.lock().unwrap().clone()
}

// Tauri命令：安装更新
#[command]
pub fn install_update(app_handle: AppHandle, script_path: String) -> Result<(), String> {
    // 执行更新脚本
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/C", "start", "", &script_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    // 退出当前应用
    app_handle.exit(0);

    Ok(())
}
