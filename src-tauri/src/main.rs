#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod lib;
use lib::set_config;
mod downloader;
mod plugins;
mod updater;
mod usb_api;

use downloader::download_file_with_progress;
use plugins::{
    disable_plugin, download_plugin, enable_plugin, get_plugin_files,
};
use tauri::Manager;
use updater::{download_update, get_app_download_status, install_update};

use std::process::Command;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // 更新相关命令
            download_update,
            get_app_download_status,
            install_update,
            // 插件相关命令
            download_plugin,
            get_plugin_files,
            enable_plugin,
            disable_plugin,
            // 启动盘相关命令
            check_boot_drive,
            get_all_drives,
            read_boot_drive_version,
            get_drive_info,
            // 文件操作相关命令
            download_file_to_path,
            // 打开链接
            open_link_os,
            // USB设备相关命令
            usb_api::get_usb_devices,
            usb_api::get_system_boot_mode,
            usb_api::deploy_to_usb,
            usb_api::restart_app,
            usb_api::close_app,
            // 新增Ventoy安装命令
            install_ventoy
        ])
        .setup(|app| {
            set_config(app);

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 打开链接
#[tauri::command]
fn open_link_os(url: String) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(url)
        .spawn()
        .map_err(|e| format!("无法在外部浏览器中打开链接"))?;
    Ok(())
}

// 安装Ventoy
#[tauri::command]
async fn install_ventoy(physical_drive: u32, boot_mode: String) -> Result<String, String> {
    use std::path::Path;
    
    // Ventoy可执行文件路径
    let ventoy_exe = "E:\\ventoy\\Ventoy2Disk.exe";
    
    // 检查Ventoy可执行文件是否存在
    if !Path::new(ventoy_exe).exists() {
        return Err("Ventoy程序不存在，请确保已正确安装".to_string());
    }
    
    // 构建命令参数
    let mut args = vec![
        "VTOYCLI".to_string(),
        "/I".to_string(),
        format!("/PhyDrive:{}", physical_drive),
        "/NOUSBCheck".to_string(),
    ];
    
    // 如果是UEFI模式，添加GPT参数
    if boot_mode.to_uppercase() == "UEFI" {
        args.push("/GPT".to_string());
    }
    
    println!("执行Ventoy安装命令: {} {:?}", ventoy_exe, args);
    
    // 执行命令
    match Command::new(ventoy_exe)
        .args(&args)
        .output()
    {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            
            println!("Ventoy安装输出: {}", stdout);
            if !stderr.is_empty() {
                println!("Ventoy安装错误: {}", stderr);
            }
            
            if output.status.success() {
                // 等待一下让系统识别新的Ventoy设备
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                Ok("Ventoy安装成功".to_string())
            } else {
                Err(format!("Ventoy安装失败: {}", stderr))
            }
        }
        Err(e) => {
            Err(format!("执行Ventoy命令失败: {}", e))
        }
    }
}

// 检测启动盘
#[tauri::command]
async fn check_boot_drive() -> Result<Option<BootDriveInfo>, String> {
    use std::path::Path;
    let drives = get_all_drives().await?;
    for drive in drives {
        let config_path = format!("{}\\cloud-pe\\config.json", drive);
        let iso_path = format!("{}\\Cloud-PE.iso", drive);

        // 检查两个文件是否同时存在
        if Path::new(&config_path).exists() && Path::new(&iso_path).exists() {
            match read_boot_drive_version(drive.clone()).await {
                Ok(version) => {
                    return Ok(Some(BootDriveInfo {
                        letter: drive,
                        version,
                        is_boot_drive: true,
                    }));
                }
                Err(_) => continue,
            }
        }
    }
    Ok(None)
}

// 响应启动盘更改
#[tauri::command]
async fn get_drive_info(drive_letter: String) -> Result<GetDriveInfo, String> {
   use std::path::Path;
   
   let config_path = format!("{}\\cloud-pe\\config.json", drive_letter);
   let iso_path = format!("{}\\Cloud-PE.iso", drive_letter);
   
   // 检查两个文件是否同时存在
   let is_boot_drive = Path::new(&config_path).exists() && Path::new(&iso_path).exists();
   
   Ok(GetDriveInfo {
       letter: drive_letter,
       is_boot_drive,
   })
}

// 数据类型定义
#[derive(serde::Serialize)]
struct GetDriveInfo {
   letter: String,
   #[serde(rename = "isBootDrive")]
   is_boot_drive: bool,
}
   

// 获取所有驱动器
#[tauri::command]
async fn get_all_drives() -> Result<Vec<String>, String> {
    use std::fs;

    let mut drives = Vec::new();

    for letter in b'A'..=b'Z' {
        let drive = format!("{}:", letter as char);
        let path = format!("{}\\", drive);

        if fs::metadata(&path).is_ok() {
            drives.push(drive);
        }
    }

    Ok(drives)
}

// 启动盘信息结构
#[derive(serde::Serialize, serde::Deserialize)]
struct BootDriveInfo {
    letter: String,
    version: String,
    is_boot_drive: bool,
}

// 读取启动盘版本信息
#[tauri::command]
async fn read_boot_drive_version(drive_letter: String) -> Result<String, String> {
    use serde_json::Value;
    use std::fs;

    let config_path = format!("{}\\cloud-pe\\config.json", drive_letter);

    match fs::read_to_string(&config_path) {
        Ok(content) => match serde_json::from_str::<Value>(&content) {
            Ok(json) => {
                if let Some(pe) = json.get("pe") {
                    if let Some(version) = pe.get("version") {
                        if let Some(version_str) = version.as_str() {
                            Ok(version_str.to_string())
                        } else {
                            Err("版本信息格式错误".to_string())
                        }
                    } else {
                        Err("未找到版本信息".to_string())
                    }
                } else {
                    Err("配置文件格式错误".to_string())
                }
            }
            Err(e) => Err(format!("解析JSON失败: {}", e)),
        },
        Err(e) => Err(format!("读取配置文件失败: {}", e)),
    }
}

// 下载文件到指定路径
#[tauri::command]
async fn download_file_to_path(
    app: tauri::AppHandle,
    url: String,
    save_path: String,
    thread: Option<u8>,
) -> Result<String, String> {
    let thread_count = thread.unwrap_or(8);

    match download_file_with_progress(app, url, save_path, thread_count).await {
        Ok(file_path) => Ok(file_path),
        Err(e) => Err(format!("下载失败: {}", e)),
    }
}