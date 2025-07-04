use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;
use std::{env, path::PathBuf};
use tauri_plugin_store::StoreExt;

#[derive(Debug, Serialize, Deserialize)]
struct DriveInfo {
    letter: String,
    is_boot_drive: bool,
}

// 检查文件是否存在
#[tauri::command]
fn check_file_exists(path: &str) -> bool {
    Path::new(path).exists()
}

// 检查目录是否存在
#[tauri::command]
fn check_directory_exists(path: &str) -> bool {
    let path = Path::new(path);
    path.exists() && path.is_dir()
}

// 创建目录
#[tauri::command]
fn create_directory(path: &str) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|e| e.to_string())
}

// 读取配置文件
#[tauri::command]
fn read_config_file(path: &str) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

// 写入配置文件
#[tauri::command]
fn write_config_file(path: &str, content: &str) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

// 获取所有驱动器
#[tauri::command]
fn get_all_drives() -> Vec<String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:", char::from(letter));
            let path = Path::new(&drive);
            if path.exists() {
                drives.push(drive);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        //我草泥馬，傻逼manus

    }

    drives
}

// 检查启动盘
#[tauri::command]
fn check_boot_drive() -> Option<DriveInfo> {
    let drives = get_all_drives();

    for drive in drives {
        let iso_path = format!("{}\\Cloud-PE.iso", drive);
        let config_path = format!("{}\\cloud-pe\\config.json", drive);

        if Path::new(&iso_path).exists() || Path::new(&config_path).exists() {
            return Some(DriveInfo {
                letter: drive,
                is_boot_drive: true,
            });
        }
    }

    None
}

// 检查网络连接
#[tauri::command]
async fn check_network_connection() -> Result<bool, String> {
    let client = Client::new();

    match client
        .get("https://api.ce-ramos.cn/Hub/connecttest/index.html")
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                match response.text().await {
                    Ok(text) => Ok(text.trim() == "This is CE-RAMOS Hub Connect Test Page"),
                    Err(e) => Err(format!("Failed to read response: {}", e)),
                }
            } else {
                Ok(false)
            }
        }
        Err(e) => Err(format!("Network request failed: {}", e)),
    }
}

// 退出应用
#[tauri::command]
fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_file_exists,
            check_directory_exists,
            create_directory,
            read_config_file,
            write_config_file,
            get_all_drives,
            check_boot_drive,
            check_network_connection,
            exit_app,

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[derive(Deserialize, Serialize)]
struct Config {
    thread: u32,
    path: String,
}

#[allow(dead_code)]
pub fn set_config(app: &tauri::App) {
    let exe_path = env::current_exe().expect("Failed to get current executable path");
    let dir = PathBuf::from(exe_path.parent().unwrap());
    let dir_string = dir.display().to_string();
    let config = Config {
        thread: 4,
        path: format!("{}\\temp", dir_string),
    };
    /*  let stores = app.app_handle().state::<StoreCollection<Wry>>();
    let path = PathBuf::from("store.bin");

    with_store(app.app_handle().clone(), stores, path, |store| {
        match store.get("thread") {
            None => {
                store.insert("thread".to_string(), json!({ "thread": 4 }))?;
                store.insert("path".to_string(), json!({ "path": config.path }))?;
                store.save()?;
            }
            Some(_) => {
                println!("{}", store.get("thread").unwrap())
            }
        }

        Ok(())
    })
    .expect("0x6"); */
    let store = app.store("store.json").expect("Failed to open store");
    match store.get("thread") {
        None => {
            store.set("thread".to_string(), json!({ "thread": 4 }));
            store.set("path".to_string(), json!({ "path": config.path }));
            store.save().expect("Failed to save store");
        }
        Some(_) => {
            println!("{}", store.get("thread").unwrap())
        }
    }
}
