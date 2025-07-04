use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{self, Write, Read};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Manager};
use tokio::time::Duration;
use url::Url;
use zip::ZipArchive;
use encoding_rs::GBK;

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
    println!("开始从URL提取文件名...");
    let client = reqwest::Client::new();
    let response = client.head(url.as_str()).send().await?;

    // 尝试从Content-Disposition头解析
    if let Some(content_disposition) = response.headers().get(reqwest::header::CONTENT_DISPOSITION) {
        if let Ok(cd) = content_disposition.to_str() {
            if let Some(name) = parse_content_disposition(cd) {
                let filename = urlencoding::decode(&name)?.to_string();
                println!("已从响应头获取文件名: {}", filename);
                return Ok(filename);
            }
        }
    }

    // 从URL路径最后一段获取文件名
    let filename = url
        .path_segments()
        .and_then(|segments| segments.last())
        .unwrap_or("unknown_file")
        .to_string();
    
    println!("已从URL路径获取文件名: {}", filename);
    Ok(filename)
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
    _thread_count: u8,
) -> Result<String, Box<dyn std::error::Error>> {
    println!("开始下载文件...");
    println!("下载URL: {}", url);
    println!("保存目录: {}", save_dir.display());
    
    // 确保目录存在
    if !save_dir.exists() {
        fs::create_dir_all(&save_dir)?;
        println!("已创建保存目录");
    }

    // 获取文件名
    let filename = extract_filename(&url).await?;
    let save_path = save_dir.join(&filename);
    println!("文件将保存到: {}", save_path.display());

    // 创建HTTP客户端
    let client = reqwest::Client::new();

    // 获取文件大小
    println!("开始获取文件大小...");
    let response = client.head(url.as_str()).send().await?;
    let total_size = response
        .headers()
        .get(reqwest::header::CONTENT_LENGTH)
        .and_then(|ct_len| ct_len.to_str().ok())
        .and_then(|ct_len| ct_len.parse::<u64>().ok())
        .unwrap_or(0);
    
    println!("文件大小: {} MB", total_size as f64 / 1024.0 / 1024.0);

    // 开始下载
    println!("开始下载文件内容...");
    let response = client.get(url.as_str()).send().await?;
    let mut file = File::create(&save_path)?;
    let downloaded = Arc::new(Mutex::new(0u64));
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
                    let speed = (current_downloaded - last_downloaded) as f64 / elapsed / 1024.0 / 1024.0;
                    let progress = if total_size > 0 {
                        (current_downloaded * 100) / total_size
                    } else {
                        0
                    };

                    // 更新全局状态
                    {
                        let mut status = DOWNLOAD_STATUS.lock().unwrap();
                        *status = Some(DownloadStatus {
                            progress,
                            speed: format!("{:.2}", speed),
                        });
                    }

                    // 输出下载进度
                    println!(
                        "下载进度: {}% | 速度: {:.2} MB/s | 已下载: {:.2} MB / {:.2} MB",
                        progress,
                        speed,
                        current_downloaded as f64 / 1024.0 / 1024.0,
                        total_size as f64 / 1024.0 / 1024.0
                    );

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

    println!("文件下载完成！");
    println!("已保存文件: {}", save_path.display());
    
    Ok(save_path.to_string_lossy().to_string())
}

// 解压文件（使用Rust原生库）
fn extract_archive(
    archive_path: &str,
    extract_dir: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("开始解压文件...");
    println!("压缩包路径: {}", archive_path);
    println!("解压目标目录: {}", extract_dir);
    
    // 确保目录存在
    let extract_path = Path::new(extract_dir);
    if !extract_path.exists() {
        fs::create_dir_all(extract_path)?;
        println!("已创建解压目标目录");
    }

    // 打开ZIP文件
    let file = File::open(archive_path)?;
    let mut archive = ZipArchive::new(file)?;
    
    let total_files = archive.len();
    println!("压缩包中共有 {} 个文件", total_files);

    // 解压每个文件
    for i in 0..total_files {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => extract_path.join(path),
            None => continue,
        };

        // 创建目录
        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
            continue;
        }

        // 创建父目录
        if let Some(p) = outpath.parent() {
            if !p.exists() {
                fs::create_dir_all(&p)?;
            }
        }

        // 写入文件
        let mut outfile = File::create(&outpath)?;
        io::copy(&mut file, &mut outfile)?;
        
        // 每解压10个文件输出一次进度
        if (i + 1) % 10 == 0 || i + 1 == total_files {
            println!("解压进度: {}/{} ({:.1}%)", 
                i + 1, 
                total_files, 
                ((i + 1) as f64 / total_files as f64) * 100.0
            );
        }
    }

    println!("文件解压完成！");
    println!("解压后的文件位于: {}", extract_dir);
    
    // 列出解压后的主要文件和目录
    println!("\n解压后的主要内容:");
    if let Ok(entries) = fs::read_dir(extract_dir) {
        for entry in entries.flatten().take(10) {
            if let Ok(file_name) = entry.file_name().into_string() {
                let file_type = if entry.path().is_dir() { "[目录]" } else { "[文件]" };
                println!("  {} {}", file_type, file_name);
            }
        }
    }
    
    Ok(())
}

// 创建更新脚本（使用GBK编码保存）
fn create_update_script(
    app_dir: &str,
    tmp_dir: &str,
    app_name: &str,
) -> Result<String, Box<dyn std::error::Error>> {
    println!("开始创建更新脚本...");
    let script_path = Path::new(app_dir).join("tmpAppUpdata.bat");
    
    // 准备脚本内容
    let mut script_content = String::new();
    
    #[cfg(target_os = "windows")]
    {
        // 使用 \r\n 作为 Windows 换行符
        script_content.push_str("@echo off\r\n");
        script_content.push_str("echo ==========================================\r\n");
        script_content.push_str("echo 开始执行应用程序更新...\r\n");
        script_content.push_str("echo ==========================================\r\n");
        script_content.push_str("echo.\r\n");
        script_content.push_str("echo [步骤1/5] 等待应用程序关闭...\r\n");
        script_content.push_str("timeout /t 2 /nobreak > nul\r\n");
        script_content.push_str("echo [完成] 应用程序已关闭\r\n");
        script_content.push_str("echo.\r\n");
        
        script_content.push_str("echo [步骤2/5] 清理旧版本文件...\r\n");
        // 删除当前目录下除tmpAppUpdata.bat和tmpFile外的所有文件和文件夹
        script_content.push_str("for /d %%i in (*) do if not \"%%i\"==\"tmpFile\" (\r\n");
        script_content.push_str("    echo   删除目录: %%i\r\n");
        script_content.push_str("    rd /s /q \"%%i\"\r\n");
        script_content.push_str(")\r\n");
        
        script_content.push_str("for %%i in (*) do if not \"%%i\"==\"tmpAppUpdata.bat\" (\r\n");
        script_content.push_str("    echo   删除文件: %%i\r\n");
        script_content.push_str("    del \"%%i\"\r\n");
        script_content.push_str(")\r\n");
        script_content.push_str("echo [完成] 旧版本文件已清理\r\n");
        script_content.push_str("echo.\r\n");

        script_content.push_str("echo [步骤3/5] 安装新版本文件...\r\n");
        script_content.push_str(&format!("echo   源目录: {}\r\n", tmp_dir));
        script_content.push_str(&format!("echo   目标目录: {}\r\n", app_dir));
        // 移动tmpFile中的所有文件到当前目录
        script_content.push_str(&format!("xcopy /e /y \"{}\\*\" \"{}\\\" > nul\r\n", tmp_dir, app_dir));
        script_content.push_str("echo [完成] 新版本文件已安装\r\n");
        script_content.push_str("echo.\r\n");

        script_content.push_str("echo [步骤4/5] 清理临时文件...\r\n");
        // 删除临时文件夹
        script_content.push_str(&format!("rd /s /q \"{}\"\r\n", tmp_dir));
        script_content.push_str("echo [完成] 临时文件已清理\r\n");
        script_content.push_str("echo.\r\n");

        script_content.push_str("echo [步骤5/5] 启动新版本应用程序...\r\n");
        script_content.push_str(&format!("echo   应用程序: {}\r\n", app_name));
        // 启动新版本应用
        script_content.push_str(&format!("start \"\" \"{}\"\r\n", app_name));
        script_content.push_str("echo [完成] 新版本应用程序已启动\r\n");
        script_content.push_str("echo.\r\n");
        
        script_content.push_str("echo ==========================================\r\n");
        script_content.push_str("echo 更新完成！\r\n");
        script_content.push_str("echo ==========================================\r\n");
        script_content.push_str("echo.\r\n");
        script_content.push_str("echo 正在清理更新脚本...\r\n");
        
        // 删除自身
        script_content.push_str("del \"%~f0\"\r\n");
    }

    // 将内容转换为 GBK 编码
    let (encoded, _, _) = GBK.encode(&script_content);
    
    // 写入文件
    let mut file = File::create(&script_path)?;
    file.write_all(&encoded)?;

    println!("更新脚本创建完成: {}", script_path.display());
    Ok(script_path.to_string_lossy().to_string())
}

// Tauri命令：下载更新
#[command]
pub async fn download_update(
    app_handle: AppHandle,
    url: String,
    app_name: String,
) -> Result<String, String> {
    println!("\n========================================");
    println!("开始应用程序更新流程");
    println!("========================================\n");
    
    // 重置下载状态
    {
        let mut status = DOWNLOAD_STATUS.lock().unwrap();
        *status = Some(DownloadStatus {
            progress: 0,
            speed: "0.00".to_string(),
        });
    }

    // 获取应用程序安装目录（exe所在目录）
    println!("获取应用程序安装目录...");
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("获取exe路径失败: {}", e))?;
    
    let app_dir = exe_path
        .parent()
        .ok_or("无法获取exe父目录")?
        .to_path_buf();

    println!("应用程序安装目录: {}", app_dir.display());

    let app_dir_str = app_dir.to_string_lossy().to_string();

    // 创建临时目录路径
    let download_filename = format!("update_{}.zip", chrono::Local::now().format("%Y%m%d_%H%M%S"));
    let tmp_file_path = app_dir.join(&download_filename);
    let tmp_dir_path = app_dir.join("tmpFile");

    // 下载更新文件
    println!("\n[步骤 1/4] 下载更新包...");
    let download_result = download_file(
        Url::parse(&url).map_err(|e| e.to_string())?,
        app_dir.clone(),
        8, // 使用8个线程下载
    )
    .await
    .map_err(|e| e.to_string())?;

    println!("已完成下载更新包");
    println!("更新包位置: {}", download_result);

    // 解压更新文件到临时目录
    println!("\n[步骤 2/4] 解压更新包...");
    extract_archive(
        &download_result,
        &tmp_dir_path.to_string_lossy(),
    )
    .map_err(|e| format!("解压失败: {}", e))?;
    println!("已完成解压更新包");

    // 删除下载的压缩包
    println!("\n[步骤 3/4] 清理下载的压缩包...");
    if let Err(e) = fs::remove_file(&download_result) {
        println!("警告: 无法删除压缩包: {}", e);
    } else {
        println!("已完成清理压缩包");
    }

    // 创建更新脚本
    println!("\n[步骤 4/4] 创建更新脚本...");
    let script_path = create_update_script(
        &app_dir_str, 
        &tmp_dir_path.to_string_lossy(), 
        &app_name
    )
    .map_err(|e| e.to_string())?;
    
    println!("已完成创建更新脚本");
    
    println!("\n========================================");
    println!("更新准备完成！");
    println!("========================================\n");

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
    println!("\n========================================");
    println!("开始安装更新...");
    println!("========================================\n");
    
    println!("执行更新脚本: {}", script_path);
    
    // 执行更新脚本
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(&["/C", "start", "", &script_path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    println!("更新脚本已启动，应用程序即将退出...");
    
    // 退出当前应用
    app_handle.exit(0);

    Ok(())
}