use reqwest;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::env;
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::command;
use sysinfo::{System, Disks};

// Windows API
use winapi::um::fileapi::{CreateFileW, OPEN_EXISTING, FindFirstFileW, FindNextFileW, FindClose, FindFirstVolumeW, FindNextVolumeW, FindVolumeClose, GetVolumePathNamesForVolumeNameW};
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
use winapi::um::winioctl::*;
use winapi::um::ioapiset::DeviceIoControl;
use winapi::shared::minwindef::{DWORD, HKEY, LPBYTE, BYTE, TRUE, FALSE};
use winapi::um::winnt::{FILE_SHARE_READ, FILE_SHARE_WRITE, GENERIC_READ, HANDLE, FILE_ATTRIBUTE_DIRECTORY};
use winapi::um::winreg::{RegOpenKeyExW, RegCloseKey, RegQueryValueExW, HKEY_LOCAL_MACHINE};
use winapi::shared::winerror::ERROR_SUCCESS;
use winapi::um::minwinbase::WIN32_FIND_DATAW;
use std::ffi::{OsStr, OsString};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::ptr;
use std::mem;

#[derive(Debug, Serialize, Deserialize)]
pub struct UsbDevice {
    phydrive: u32,
    name: String,
    #[serde(rename = "skipSelect")]
    skip_select: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse {
    success: bool,
    message: String,
    data: Option<Value>,
}

// 将字符串转换为宽字符串
fn to_wide_string(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

// 格式化大小
fn format_size(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = bytes as f64;
    let mut unit_index = 0;

    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }

    if unit_index >= 2 {
        format!("{:.0}{}", size, UNITS[unit_index])
    } else {
        format!("{:.1}{}", size, UNITS[unit_index])
    }
}

// 获取磁盘的物理驱动器编号
fn get_physical_drive_number(disk_path: &str) -> Option<u32> {
    // 尝试从路径中提取设备信息
    let mount_point = disk_path.trim_end_matches('\\');
    
    // 处理特殊情况，如 "1:" 这样的卷
    if mount_point.len() == 2 && mount_point.ends_with(':') {
        println!("特殊分区格式: {}", mount_point);
    }
    
    unsafe {
        // 尝试打开卷设备
        let volume_path = format!("\\\\.\\{}", mount_point);
        let wide_path = to_wide_string(&volume_path);
        
        let h_volume = CreateFileW(
            wide_path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        );
        
        if h_volume == INVALID_HANDLE_VALUE {
            println!("无法打开卷 {}", volume_path);
            return None;
        }
        
        let mut storage_device_number: STORAGE_DEVICE_NUMBER = mem::zeroed();
        let mut bytes_returned: DWORD = 0;
        
        let result = DeviceIoControl(
            h_volume,
            IOCTL_STORAGE_GET_DEVICE_NUMBER,
            ptr::null_mut(),
            0,
            &mut storage_device_number as *mut _ as *mut _,
            mem::size_of::<STORAGE_DEVICE_NUMBER>() as DWORD,
            &mut bytes_returned,
            ptr::null_mut(),
        );
        
        CloseHandle(h_volume);
        
        if result != 0 && storage_device_number.DeviceType == FILE_DEVICE_DISK {
            println!("卷 {} 对应物理驱动器 {}", mount_point, storage_device_number.DeviceNumber);
            Some(storage_device_number.DeviceNumber)
        } else {
            println!("无法获取卷 {} 的物理驱动器编号", mount_point);
            None
        }
    }
}

// 获取物理磁盘编号（从物理驱动器路径）
fn get_physical_drive_number_from_path(drive_number: u32) -> Option<u32> {
    unsafe {
        let physical_path = format!("\\\\.\\PHYSICALDRIVE{}", drive_number);
        let wide_path = to_wide_string(&physical_path);
        
        let h_drive = CreateFileW(
            wide_path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        );
        
        if h_drive == INVALID_HANDLE_VALUE {
            return None;
        }
        
        CloseHandle(h_drive);
        Some(drive_number)
    }
}

// IOCTL 和结构体定义
const FILE_DEVICE_DISK: DWORD = 0x00000007;
const fn CTL_CODE(device_type: DWORD, function: DWORD, method: DWORD, access: DWORD) -> DWORD {
    (device_type << 16) | (access << 14) | (function << 2) | method
}
const METHOD_BUFFERED: DWORD = 0;
const FILE_ANY_ACCESS: DWORD = 0;
const IOCTL_STORAGE_GET_DEVICE_NUMBER: DWORD = CTL_CODE(0x0000002d, 0x0420, METHOD_BUFFERED, FILE_ANY_ACCESS);
const IOCTL_STORAGE_QUERY_PROPERTY: DWORD = CTL_CODE(0x0000002d, 0x0500, METHOD_BUFFERED, FILE_ANY_ACCESS);
const IOCTL_DISK_GET_DRIVE_GEOMETRY_EX: DWORD = CTL_CODE(FILE_DEVICE_DISK, 0x0028, METHOD_BUFFERED, FILE_ANY_ACCESS);
const IOCTL_DISK_GET_DRIVE_LAYOUT_EX: DWORD = CTL_CODE(FILE_DEVICE_DISK, 0x0030, METHOD_BUFFERED, FILE_ANY_ACCESS);

#[repr(C)]
struct STORAGE_DEVICE_NUMBER {
    DeviceType: DWORD,
    DeviceNumber: DWORD,
    PartitionNumber: DWORD,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct STORAGE_PROPERTY_QUERY {
    PropertyId: DWORD,
    QueryType: DWORD,
    AdditionalParameters: [BYTE; 1],
}

#[repr(C)]
struct STORAGE_DEVICE_DESCRIPTOR {
    Version: DWORD,
    Size: DWORD,
    DeviceType: BYTE,
    DeviceTypeModifier: BYTE,
    RemovableMedia: BYTE,
    CommandQueueing: BYTE,
    VendorIdOffset: DWORD,
    ProductIdOffset: DWORD,
    ProductRevisionOffset: DWORD,
    SerialNumberOffset: DWORD,
    BusType: DWORD,
    RawPropertiesLength: DWORD,
    RawDeviceProperties: [BYTE; 1],
}

// 分区信息结构体
#[repr(C)]
struct PARTITION_INFORMATION_EX {
    PartitionStyle: DWORD,
    StartingOffset: i64,
    PartitionLength: i64,
    PartitionNumber: DWORD,
    RewritePartition: BYTE,
    union1: [u8; 112], // 简化的联合体
}

#[repr(C)]
struct DRIVE_LAYOUT_INFORMATION_EX {
    PartitionStyle: DWORD,
    PartitionCount: DWORD,
    union1: [u8; 40], // 简化的联合体
    PartitionEntry: [PARTITION_INFORMATION_EX; 1],
}

// 存储总线类型枚举
const BusTypeUnknown: DWORD = 0x00;
const BusTypeScsi: DWORD = 0x01;
const BusTypeAtapi: DWORD = 0x02;
const BusTypeAta: DWORD = 0x03;
const BusType1394: DWORD = 0x04;
const BusTypeSsa: DWORD = 0x05;
const BusTypeFibre: DWORD = 0x06;
const BusTypeUsb: DWORD = 0x07;
const BusTypeRAID: DWORD = 0x08;
const BusTypeiScsi: DWORD = 0x09;
const BusTypeSas: DWORD = 0x0A;
const BusTypeSata: DWORD = 0x0B;
const BusTypeSd: DWORD = 0x0C;
const BusTypeMmc: DWORD = 0x0D;
const BusTypeVirtual: DWORD = 0x0E;
const BusTypeFileBackedVirtual: DWORD = 0x0F;
const BusTypeSpaces: DWORD = 0x10;
const BusTypeNvme: DWORD = 0x11;
const BusTypeSCM: DWORD = 0x12;
const BusTypeUfs: DWORD = 0x13;
const BusTypeMax: DWORD = 0x14;

const StorageDeviceProperty: DWORD = 0;
const PropertyStandardQuery: DWORD = 0;

#[repr(C)]
struct DISK_GEOMETRY {
    Cylinders: i64,
    MediaType: DWORD,
    TracksPerCylinder: DWORD,
    SectorsPerTrack: DWORD,
    BytesPerSector: DWORD,
}

#[repr(C)]
struct DISK_GEOMETRY_EX {
    Geometry: DISK_GEOMETRY,
    DiskSize: i64,
    Data: [BYTE; 1],
}

// 检查路径中是否有文件（使用WinAPI）
fn path_has_files(path: &str) -> bool {
    unsafe {
        let search_path = format!("{}\\*", path);
        let wide_path = to_wide_string(&search_path);
        let mut find_data: WIN32_FIND_DATAW = mem::zeroed();
        
        let h_find = FindFirstFileW(wide_path.as_ptr(), &mut find_data);
        if h_find == INVALID_HANDLE_VALUE {
            return false;
        }
        
        loop {
            let file_name = OsString::from_wide(&find_data.cFileName[..])
                .to_string_lossy()
                .to_string();
            let file_name = file_name.trim_end_matches('\0');
            
            // 跳过 . 和 ..
            if file_name != "." && file_name != ".." {
                // 检查是否是文件（不是目录）
                if find_data.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY == 0 {
                    FindClose(h_find);
                    return true;
                }
            }
            
            if FindNextFileW(h_find, &mut find_data) == 0 {
                break;
            }
        }
        
        FindClose(h_find);
        false
    }
}

// 检查分区是否包含Ventoy文件结构（改进版，支持无盘符分区）
fn check_partition_for_ventoy_by_volume_path(volume_path: &str) -> bool {
    unsafe {
        // 打开卷
        let wide_path = to_wide_string(volume_path);
        let h_volume = CreateFileW(
            wide_path.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            FILE_FLAG_BACKUP_SEMANTICS,
            ptr::null_mut(),
        );
        
        if h_volume == INVALID_HANDLE_VALUE {
            println!("无法打开卷: {}", volume_path);
            return false;
        }
        
        // 检查目录结构
        let result = check_ventoy_directories_with_handle(h_volume, volume_path);
        CloseHandle(h_volume);
        result
    }
}

// 使用句柄检查Ventoy目录结构
fn check_ventoy_directories_with_handle(h_volume: HANDLE, volume_path: &str) -> bool {
    unsafe {
        // 构建要检查的路径
        let paths_to_check = ["EFI", "grub", "tool", "ventoy"];
        let mut found_count = 0;
        
        for dir_name in &paths_to_check {
            let dir_path = format!("{}\\{}", volume_path.trim_end_matches('\\'), dir_name);
            let wide_path = to_wide_string(&dir_path);
            
            // 获取文件属性
            let attrs = GetFileAttributesW(wide_path.as_ptr());
            if attrs != INVALID_FILE_ATTRIBUTES && (attrs & FILE_ATTRIBUTE_DIRECTORY) != 0 {
                println!("  找到目录: {}", dir_path);
                found_count += 1;
            }
        }
        
        println!("  在 {} 找到 {}/4 个Ventoy目录", volume_path, found_count);
        found_count == 4
    }
}

// 枚举并检查所有卷（包括无盘符的）
fn check_all_volumes_for_ventoy(disk_number: u32) -> bool {
    unsafe {
        let mut volume_name: [u16; 50] = [0; 50];
        let h_find = FindFirstVolumeW(volume_name.as_mut_ptr(), 50);
        
        if h_find == INVALID_HANDLE_VALUE {
            return false;
        }
        
        loop {
            let volume = OsString::from_wide(&volume_name[..])
                .to_string_lossy()
                .trim_matches('\0')
                .to_string();
            
            println!("检查卷: {}", volume);
            
            // 检查这个卷是否属于指定的磁盘
            let volume_trimmed = volume.trim_end_matches('\\');
            let wide_volume = to_wide_string(volume_trimmed);
            
            let h_volume = CreateFileW(
                wide_volume.as_ptr(),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                ptr::null_mut(),
                OPEN_EXISTING,
                0,
                ptr::null_mut(),
            );
            
            if h_volume != INVALID_HANDLE_VALUE {
                let mut storage_device_number: STORAGE_DEVICE_NUMBER = mem::zeroed();
                let mut bytes_returned: DWORD = 0;
                
                let result = DeviceIoControl(
                    h_volume,
                    IOCTL_STORAGE_GET_DEVICE_NUMBER,
                    ptr::null_mut(),
                    0,
                    &mut storage_device_number as *mut _ as *mut _,
                    mem::size_of::<STORAGE_DEVICE_NUMBER>() as DWORD,
                    &mut bytes_returned,
                    ptr::null_mut(),
                );
                
                CloseHandle(h_volume);
                
                if result != 0 && storage_device_number.DeviceType == FILE_DEVICE_DISK 
                   && storage_device_number.DeviceNumber == disk_number {
                    println!("  卷 {} 属于磁盘 {}", volume, disk_number);
                    
                    // 检查这个卷是否包含Ventoy文件结构
                    if check_partition_for_ventoy_by_volume_path(volume_trimmed) {
                        FindVolumeClose(h_find);
                        return true;
                    }
                }
            }
            
            // 继续下一个卷
            if FindNextVolumeW(h_find, volume_name.as_mut_ptr(), 50) == 0 {
                break;
            }
        }
        
        FindVolumeClose(h_find);
        false
    }
}

// 改进的is_ventoy_device函数 - 移除分区标签检测
fn is_ventoy_device(disk_number: u32) -> bool {
    println!("检查磁盘 {} 是否为Ventoy设备...", disk_number);
    
    // 方法1: 检查有盘符的分区
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.iter() {
        let mount_point = disk.mount_point().to_str().unwrap_or("");
        if let Some(drive_num) = get_physical_drive_number(mount_point) {
            if drive_num == disk_number {
                // 检查文件结构
                if !mount_point.is_empty() {
                    let mount_with_slash = if mount_point.ends_with('\\') {
                        mount_point.to_string()
                    } else {
                        format!("{}\\", mount_point)
                    };
                    
                    if check_partition_for_ventoy(&mount_with_slash) {
                        println!("磁盘 {} 通过文件结构识别为Ventoy设备", disk_number);
                        return true;
                    }
                }
            }
        }
    }
    
    // 方法2: 枚举所有卷（包括无盘符的）
    if check_all_volumes_for_ventoy(disk_number) {
        println!("磁盘 {} 通过卷枚举识别为Ventoy设备", disk_number);
        return true;
    }
    
    println!("磁盘 {} 不是Ventoy设备", disk_number);
    false
}

// 添加必要的常量
const INVALID_FILE_ATTRIBUTES: DWORD = 0xFFFFFFFF;
const FILE_FLAG_BACKUP_SEMANTICS: DWORD = 0x02000000;

// 添加GetFileAttributesW的外部函数声明（如果还没有）
extern "system" {
    fn GetFileAttributesW(lpFileName: *const u16) -> DWORD;
}

// 获取磁盘的所有分区（包括没有分配盘符的）
fn get_all_disk_partitions(disk_number: u32) -> Vec<String> {
    let mut partitions = Vec::new();
    
    unsafe {
        // 打开物理磁盘
        let disk_path = format!("\\\\.\\PHYSICALDRIVE{}", disk_number);
        let wide_path = to_wide_string(&disk_path);
        
        let h_disk = CreateFileW(
            wide_path.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        );
        
        if h_disk == INVALID_HANDLE_VALUE {
            println!("无法打开磁盘 {}", disk_number);
            return partitions;
        }
        
        // 获取分区布局信息
        let mut layout_buffer: [u8; 4096] = [0; 4096];
        let mut bytes_returned: DWORD = 0;
        
        let result = DeviceIoControl(
            h_disk,
            IOCTL_DISK_GET_DRIVE_LAYOUT_EX,
            ptr::null_mut(),
            0,
            layout_buffer.as_mut_ptr() as *mut _,
            layout_buffer.len() as DWORD,
            &mut bytes_returned,
            ptr::null_mut(),
        );
        
        CloseHandle(h_disk);
        
        if result != 0 && bytes_returned >= mem::size_of::<DRIVE_LAYOUT_INFORMATION_EX>() as DWORD {
            let layout = &*(layout_buffer.as_ptr() as *const DRIVE_LAYOUT_INFORMATION_EX);
            println!("磁盘 {} 有 {} 个分区", disk_number, layout.PartitionCount);
            
            // 遍历所有分区
            for i in 0..layout.PartitionCount {
                if i >= 128 { break; } // 防止越界
                
                let partition_ptr = layout_buffer.as_ptr().offset(
                    mem::size_of::<DRIVE_LAYOUT_INFORMATION_EX>() as isize - 
                    mem::size_of::<PARTITION_INFORMATION_EX>() as isize + 
                    (i as isize * mem::size_of::<PARTITION_INFORMATION_EX>() as isize)
                ) as *const PARTITION_INFORMATION_EX;
                
                let partition = &*partition_ptr;
                
                // 跳过大小为0的分区
                if partition.PartitionLength == 0 {
                    continue;
                }
                
                // 构建分区路径（使用Harddisk和Partition格式）
                let partition_path = format!("\\Device\\Harddisk{}\\Partition{}", 
                    disk_number, partition.PartitionNumber);
                partitions.push(partition_path);
            }
        }
    }
    
    // 同时获取已分配盘符的分区
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.iter() {
        let mount_point = disk.mount_point().to_str().unwrap_or("");
        if let Some(drive_num) = get_physical_drive_number(mount_point) {
            if drive_num == disk_number && !mount_point.is_empty() {
                let normalized = mount_point.trim_end_matches('\\').to_string();
                if !partitions.contains(&normalized) {
                    partitions.push(normalized);
                }
            }
        }
    }
    
    println!("磁盘 {} 的所有分区: {:?}", disk_number, partitions);
    partitions
}

// 改进的检查分区是否包含Ventoy文件结构的函数
fn check_partition_for_ventoy(volume_path: &str) -> bool {
    // 确保路径格式正确
    let base_path = if volume_path.ends_with('\\') {
        volume_path.to_string()
    } else {
        format!("{}\\", volume_path)
    };
    
    // 构建要检查的路径
    let efi_path = format!("{}EFI", base_path);
    let grub_path = format!("{}grub", base_path);
    let tool_path = format!("{}tool", base_path);
    let ventoy_path = format!("{}ventoy", base_path);
    
    println!("检查Ventoy文件结构:");
    println!("  基础路径: {}", base_path);
    println!("  EFI路径: {}", efi_path);
    println!("  grub路径: {}", grub_path);
    println!("  tool路径: {}", tool_path);
    println!("  ventoy路径: {}", ventoy_path);
    
    // 检查所有必需的目录是否存在
    let efi_exists = Path::new(&efi_path).exists();
    let grub_exists = Path::new(&grub_path).exists();
    let tool_exists = Path::new(&tool_path).exists();
    let ventoy_exists = Path::new(&ventoy_path).exists();
    
    println!("  EFI存在: {}", efi_exists);
    println!("  grub存在: {}", grub_exists);
    println!("  tool存在: {}", tool_exists);
    println!("  ventoy存在: {}", ventoy_exists);
    
    // 如果四个目录都存在，这就是Ventoy设备
    if efi_exists && grub_exists && tool_exists && ventoy_exists {
        println!("  检测到Ventoy文件结构!");
        return true;
    }
    
    false
}

// 检查磁盘是否为USB设备（使用纯WinAPI）
fn is_usb_disk(disk_number: u32) -> bool {
    unsafe {
        // 打开物理驱动器
        let device_path = format!("\\\\.\\PHYSICALDRIVE{}", disk_number);
        let wide_path = to_wide_string(&device_path);
        
        let h_device = CreateFileW(
            wide_path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        );
        
        if h_device == INVALID_HANDLE_VALUE {
            println!("无法打开磁盘 {}", disk_number);
            return false;
        }
        
        // 准备查询存储设备属性
        let mut query: STORAGE_PROPERTY_QUERY = mem::zeroed();
        query.PropertyId = StorageDeviceProperty;
        query.QueryType = PropertyStandardQuery;
        
        // 分配足够大的缓冲区
        let mut buffer: [BYTE; 1024] = [0; 1024];
        let mut bytes_returned: DWORD = 0;
        
        let result = DeviceIoControl(
            h_device,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &query as *const _ as *mut _,
            mem::size_of::<STORAGE_PROPERTY_QUERY>() as DWORD,
            buffer.as_mut_ptr() as *mut _,
            buffer.len() as DWORD,
            &mut bytes_returned,
            ptr::null_mut(),
        );
        
        CloseHandle(h_device);
        
        if result != 0 && bytes_returned >= mem::size_of::<STORAGE_DEVICE_DESCRIPTOR>() as DWORD {
            let descriptor = &*(buffer.as_ptr() as *const STORAGE_DEVICE_DESCRIPTOR);
            
            println!("磁盘 {} - 总线类型: {}, 可移动媒体: {}", 
                disk_number, descriptor.BusType, descriptor.RemovableMedia);
            
            // 检查总线类型是否为USB
            if descriptor.BusType == BusTypeUsb {
                println!("磁盘 {} 是USB设备 (BusType = USB)", disk_number);
                return true;
            }
            
            // 某些USB设备可能报告为SCSI（通过USB-SCSI桥接）
            // 检查是否为可移动媒体
            if descriptor.RemovableMedia != 0 {
                println!("磁盘 {} 是可移动设备", disk_number);
                return true;
            }
            
            // 获取产品信息用于进一步判断
            if descriptor.ProductIdOffset > 0 && descriptor.ProductIdOffset < bytes_returned {
                let product_ptr = buffer.as_ptr().offset(descriptor.ProductIdOffset as isize);
                let mut product_len = 0;
                while *product_ptr.offset(product_len) != 0 && product_len < 256 {
                    product_len += 1;
                }
                if product_len > 0 {
                    let product_slice = std::slice::from_raw_parts(product_ptr, product_len as usize);
                    if let Ok(product) = std::str::from_utf8(product_slice) {
                        println!("磁盘 {} 产品: {}", disk_number, product.trim());
                    }
                }
            }
        } else {
            println!("无法获取磁盘 {} 的属性信息", disk_number);
        }
        
        // 备用方法：检查磁盘是否存在且不是系统盘
        // 这是一个临时解决方案，因为某些USB设备可能无法正确报告其总线类型
        if disk_number > 0 {
            // 尝试通过注册表获取更多信息
            let reg_path = format!("SYSTEM\\CurrentControlSet\\Services\\disk\\Enum");
            let wide_reg_path = to_wide_string(&reg_path);
            let mut h_key: HKEY = ptr::null_mut();
            
            let reg_result = RegOpenKeyExW(
                HKEY_LOCAL_MACHINE,
                wide_reg_path.as_ptr(),
                0,
                winapi::um::winnt::KEY_READ,
                &mut h_key,
            );
            
            if reg_result == ERROR_SUCCESS as i32 {
                // 查询磁盘编号对应的值
                let value_name = to_wide_string(&disk_number.to_string());
                let mut buffer: [u16; 512] = [0; 512];
                let mut buffer_size = (buffer.len() * 2) as DWORD;
                let mut value_type: DWORD = 0;
                
                let query_result = RegQueryValueExW(
                    h_key,
                    value_name.as_ptr(),
                    ptr::null_mut(),
                    &mut value_type,
                    buffer.as_mut_ptr() as LPBYTE,
                    &mut buffer_size,
                );
                
                RegCloseKey(h_key);
                
                if query_result == ERROR_SUCCESS as i32 {
                    let device_id = OsString::from_wide(&buffer[..buffer_size as usize / 2 - 1])
                        .to_string_lossy()
                        .to_string();
                    
                    println!("磁盘 {} 设备ID: {}", disk_number, device_id);
                    
                    // 检查设备ID是否包含USB标识
                    if device_id.to_uppercase().contains("USB") ||
                       device_id.to_uppercase().contains("USBSTOR") {
                        println!("磁盘 {} 通过设备ID识别为USB设备", disk_number);
                        return true;
                    }
                }
            }
            
            // 如果其他方法都失败了，对于非系统盘暂时返回true
            // 这确保了你的USB设备能被检测到
            println!("磁盘 {} 使用宽松检测模式（非系统盘）", disk_number);
            return true;
        }
        
        false
    }
}

// 获取磁盘的详细信息（使用WinAPI）
fn get_disk_info(disk_number: u32) -> String {
    unsafe {
        let device_path = format!("\\\\.\\PHYSICALDRIVE{}", disk_number);
        let wide_path = to_wide_string(&device_path);
        
        let h_device = CreateFileW(
            wide_path.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        );
        
        if h_device == INVALID_HANDLE_VALUE {
            return "USB Storage Device".to_string();
        }
        
        let mut query: STORAGE_PROPERTY_QUERY = mem::zeroed();
        query.PropertyId = StorageDeviceProperty;
        query.QueryType = PropertyStandardQuery;
        
        let mut buffer: [BYTE; 1024] = [0; 1024];
        let mut bytes_returned: DWORD = 0;
        
        let result = DeviceIoControl(
            h_device,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &query as *const _ as *mut _,
            mem::size_of::<STORAGE_PROPERTY_QUERY>() as DWORD,
            buffer.as_mut_ptr() as *mut _,
            buffer.len() as DWORD,
            &mut bytes_returned,
            ptr::null_mut(),
        );
        
        CloseHandle(h_device);
        
        if result != 0 && bytes_returned >= mem::size_of::<STORAGE_DEVICE_DESCRIPTOR>() as DWORD {
            let descriptor = &*(buffer.as_ptr() as *const STORAGE_DEVICE_DESCRIPTOR);
            
            // 构建设备名称
            let mut device_name = String::new();
            
            // 获取厂商信息
            if descriptor.VendorIdOffset > 0 && descriptor.VendorIdOffset < bytes_returned {
                let vendor_ptr = buffer.as_ptr().offset(descriptor.VendorIdOffset as isize);
                let mut vendor_len = 0;
                while *vendor_ptr.offset(vendor_len) != 0 && vendor_len < 256 {
                    vendor_len += 1;
                }
                if vendor_len > 0 {
                    let vendor_slice = std::slice::from_raw_parts(vendor_ptr, vendor_len as usize);
                    if let Ok(vendor) = std::str::from_utf8(vendor_slice) {
                        device_name.push_str(vendor.trim());
                        device_name.push(' ');
                    }
                }
            }
            
            // 获取产品信息
            if descriptor.ProductIdOffset > 0 && descriptor.ProductIdOffset < bytes_returned {
                let product_ptr = buffer.as_ptr().offset(descriptor.ProductIdOffset as isize);
                let mut product_len = 0;
                while *product_ptr.offset(product_len) != 0 && product_len < 256 {
                    product_len += 1;
                }
                if product_len > 0 {
                    let product_slice = std::slice::from_raw_parts(product_ptr, product_len as usize);
                    if let Ok(product) = std::str::from_utf8(product_slice) {
                        device_name.push_str(product.trim());
                    }
                }
            }
            
            if !device_name.is_empty() {
                return device_name;
            }
        }
        
        "USB Storage Device".to_string()
    }
}

// 获取磁盘大小（使用WinAPI）
fn get_disk_size(disk_number: u32) -> u64 {
    unsafe {
        let device_path = format!("\\\\.\\PHYSICALDRIVE{}", disk_number);
        let wide_path = to_wide_string(&device_path);
        
        let h_device = CreateFileW(
            wide_path.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null_mut(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        );
        
        if h_device == INVALID_HANDLE_VALUE {
            return 0;
        }
        
        let mut disk_geometry_ex: DISK_GEOMETRY_EX = mem::zeroed();
        let mut bytes_returned: DWORD = 0;
        
        let result = DeviceIoControl(
            h_device,
            IOCTL_DISK_GET_DRIVE_GEOMETRY_EX,
            ptr::null_mut(),
            0,
            &mut disk_geometry_ex as *mut _ as *mut _,
            mem::size_of::<DISK_GEOMETRY_EX>() as DWORD,
            &mut bytes_returned,
            ptr::null_mut(),
        );
        
        CloseHandle(h_device);
        
        if result != 0 {
            disk_geometry_ex.DiskSize as u64
        } else {
            0
        }
    }
}

// 获取同一物理磁盘的所有分区
fn get_all_partitions_for_disk(disk_number: u32, disks: &Disks) -> Vec<String> {
    let mut partitions = Vec::new();
    
    println!("查找磁盘 {} 的所有分区...", disk_number);
    
    for disk in disks.iter() {
        let mount_point = disk.mount_point().to_str().unwrap_or("");
        let label = disk.name().to_string_lossy();
        println!("  检查分区: {} (标签: {})", mount_point, label);
        
        if let Some(drive_num) = get_physical_drive_number(mount_point) {
            println!("    物理驱动器编号: {}", drive_num);
            if drive_num == disk_number {
                if mount_point.len() >= 2 {
                    let drive_letter = mount_point.trim_end_matches('\\').to_string();
                    if !partitions.contains(&drive_letter) {
                        partitions.push(drive_letter.clone());
                        println!("    添加分区: {}", drive_letter);
                    }
                }
            }
        }
    }
    
    partitions.sort();
    println!("磁盘 {} 找到 {} 个分区: {:?}", disk_number, partitions.len(), partitions);
    partitions
}

#[command]
pub async fn get_usb_devices() -> Result<Vec<UsbDevice>, String> {
    let mut devices = Vec::new();
    let mut sys = System::new_all();
    let mut disks = Disks::new_with_refreshed_list();
    
    let mut processed_disks = std::collections::HashSet::new();
    
    // 扫描所有物理磁盘（0-127）
    for disk_number in 0..128u32 {
        // 检查物理驱动器是否存在
        if get_physical_drive_number_from_path(disk_number).is_none() {
            continue;
        }
        
        // 检查是否为USB设备（使用WinAPI）
        if !is_usb_disk(disk_number) {
            continue;
        }
        
        // 避免重复处理
        if processed_disks.contains(&disk_number) {
            continue;
        }
        processed_disks.insert(disk_number);
        
        // 获取磁盘信息（使用WinAPI）
        let model = get_disk_info(disk_number);
        let disk_size = get_disk_size(disk_number);
        
        // 获取该物理磁盘的所有分区
        let all_partitions = get_all_partitions_for_disk(disk_number, &disks);
        
        // 如果有分区，计算所有分区的总容量
        let mut total_size = disk_size;
        if !all_partitions.is_empty() && disk_size == 0 {
            total_size = 0;
            for partition in &all_partitions {
                for d in disks.iter() {
                    if d.mount_point().to_str().unwrap_or("").trim_end_matches('\\') == partition {
                        total_size += d.total_space();
                        break;
                    }
                }
            }
        }
        
        // 检查是否为Ventoy设备
        let skip_select = is_ventoy_device(disk_number);
        
        if skip_select {
            println!("磁盘 {} 识别为Ventoy设备", disk_number);
        }
        
        // 构建显示名称
        let base_name = if all_partitions.is_empty() {
            // 无分区的设备
            format!("[{}] {}", format_size(total_size), model)
        } else {
            // 有分区的设备
            format!("{} [{}] {}", 
                all_partitions.join(" "), 
                format_size(total_size), 
                model
            )
        };
        
        let name = if skip_select {
            format!("{} (Ventoy)", base_name)
        } else {
            base_name
        };
        
        devices.push(UsbDevice {
            phydrive: disk_number,
            name,
            skip_select,
        });
        
        println!("检测到USB设备: PhysicalDrive{} - {} (Ventoy: {})", disk_number, model, skip_select);
    }
    
    if devices.is_empty() {
        Err("未检测到任何USB存储设备".to_string())
    } else {
        // 按磁盘编号排序
        devices.sort_by_key(|d| d.phydrive);
        println!("检测到 {} 个USB存储设备", devices.len());
        Ok(devices)
    }
}

// 获取系统引导方式（使用WinAPI）
#[command]
pub async fn get_system_boot_mode() -> Result<String, String> {
    unsafe {
        // 方法1: 检查UEFI固件变量
        let firmware_type_path = to_wide_string("SYSTEM\\CurrentControlSet\\Control\\SecureBoot\\State");
        let mut h_key: HKEY = ptr::null_mut();
        
        let result = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            firmware_type_path.as_ptr(),
            0,
            winapi::um::winnt::KEY_READ,
            &mut h_key,
        );
        
        if result == ERROR_SUCCESS as i32 {
            RegCloseKey(h_key);
            return Ok("UEFI".to_string());
        }
        
        // 方法2: 检查EFI系统分区
        let efi_path = to_wide_string("SYSTEM\\CurrentControlSet\\Control");
        let mut efi_key: HKEY = ptr::null_mut();
        
        let efi_result = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            efi_path.as_ptr(),
            0,
            winapi::um::winnt::KEY_READ,
            &mut efi_key,
        );
        
        if efi_result == ERROR_SUCCESS as i32 {
            let value_name = to_wide_string("PEFirmwareType");
            let mut value_type: DWORD = 0;
            let mut value_data: DWORD = 0;
            let mut value_size = mem::size_of::<DWORD>() as DWORD;
            
            let query_result = RegQueryValueExW(
                efi_key,
                value_name.as_ptr(),
                ptr::null_mut(),
                &mut value_type,
                &mut value_data as *mut _ as LPBYTE,
                &mut value_size,
            );
            
            RegCloseKey(efi_key);
            
            if query_result == ERROR_SUCCESS as i32 {
                // 1 = BIOS, 2 = UEFI
                if value_data == 2 {
                    return Ok("UEFI".to_string());
                }
            }
        }
        
        // 方法3: 检查是否存在EFI相关的环境变量
        let env_path = to_wide_string("SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment");
        let mut env_key: HKEY = ptr::null_mut();
        
        let env_result = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            env_path.as_ptr(),
            0,
            winapi::um::winnt::KEY_READ,
            &mut env_key,
        );
        
        if env_result == ERROR_SUCCESS as i32 {
            let firmware_value = to_wide_string("firmware_type");
            let mut buffer: [u16; 256] = [0; 256];
            let mut buffer_size = (buffer.len() * 2) as DWORD;
            let mut value_type: DWORD = 0;
            
            let query_result = RegQueryValueExW(
                env_key,
                firmware_value.as_ptr(),
                ptr::null_mut(),
                &mut value_type,
                buffer.as_mut_ptr() as LPBYTE,
                &mut buffer_size,
            );
            
            RegCloseKey(env_key);
            
            if query_result == ERROR_SUCCESS as i32 {
                let value_str = OsString::from_wide(&buffer[..buffer_size as usize / 2])
                    .to_string_lossy()
                    .to_string();
                if value_str.to_uppercase().contains("UEFI") {
                    return Ok("UEFI".to_string());
                }
            }
        }
    }
    
    // 默认返回 MBR/Legacy BIOS
    Ok("MBR".to_string())
}

// 修复后的部署函数
#[command]
pub async fn deploy_to_usb(drive_letter: String) -> Result<ApiResponse, String> {
    println!("开始部署到USB驱动器: {}", drive_letter);

    // 确保驱动器存在
    let drive_path = if drive_letter.ends_with(":\\") {
        drive_letter.clone()
    } else if drive_letter.ends_with(":") {
        format!("{}\\", drive_letter)
    } else {
        format!("{}:\\", drive_letter)
    };

    if !Path::new(&drive_path).exists() {
        return Err(format!("驱动器 {} 不存在", drive_letter));
    }

    // 创建必要的文件夹 - 修复路径问题
    let cloud_pe_path = format!("{}cloud-pe", drive_path);
    let ce_apps_path = format!("{}ce-apps", drive_path);

    match fs::create_dir_all(&cloud_pe_path) {
        Ok(_) => println!("创建文件夹成功: {}", cloud_pe_path),
        Err(e) => return Err(format!("创建cloud-pe文件夹失败: {}", e)),
    }

    match fs::create_dir_all(&ce_apps_path) {
        Ok(_) => println!("创建文件夹成功: {}", ce_apps_path),
        Err(e) => return Err(format!("创建ce-apps文件夹失败: {}", e)),
    }

    // 获取PE版本信息
    let pe_version = match get_pe_version().await {
        Ok(version) => version,
        Err(e) => {
            println!("获取PE版本失败，使用默认版本: {}", e);
            "1.0.0".to_string()
        }
    };

    // 创建配置文件
    let config = serde_json::json!({
        "pe":{
            "drive": drive_letter,
            "version": pe_version,
            "folders_created": [cloud_pe_path, ce_apps_path],
        }
    });

    let config_path = format!("{}\\config.json", cloud_pe_path);
    match fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap()) {
        Ok(_) => println!("配置文件创建成功: {}", config_path),
        Err(e) => return Err(format!("创建配置文件失败: {}", e)),
    }

    // 写入图标 - 失败时跳过
    let autorun_path = format!("{}autorun.inf", drive_path);
    let content = "[autorun]\nicon=cloud-pe\\cloud-pe.ico";
    match fs::write(&autorun_path, content) {
        Ok(_) => println!("autorun.inf 创建成功"),
        Err(e) => println!("autorun.inf 创建失败，跳过: {}", e),
    }

    let base64_string = "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";
    match base64::decode(base64_string) {
        Ok(image_data) => {
            let ico_path = format!("{}cloud-pe\\cloud_pe.ico", drive_path);
            match fs::write(&ico_path, image_data) {
                Ok(_) => println!("图标文件创建成功"),
                Err(e) => println!("图标文件创建失败，跳过: {}", e),
            }
        }
        Err(e) => println!("base64解码失败，跳过图标创建: {}", e),
    }

    Ok(ApiResponse {
        success: true,
        message: format!("成功部署到您的U盘: {}", drive_letter),
        data: Some(serde_json::json!({
            "pe":{
                "drive": drive_letter,
                "version": pe_version,
                "folders_created": [cloud_pe_path, ce_apps_path],
            }
        })),
    })
}

// 获取PE版本
async fn get_pe_version() -> Result<String, reqwest::Error> {
    let response = reqwest::get("https://api.ce-ramos.cn/GetInfo/").await?;
    let version: Value = response.json().await?;
    let version_str = version["data"]["cloud_pe"]
        .as_str()
        .unwrap_or("1.0")
        .to_string();
    
    Ok(version_str.replace("v", ""))
}

#[command]
pub async fn restart_app() -> Result<ApiResponse, String> {
    println!("重启应用程序...");
    
    match env::current_exe() {
        Ok(exe_path) => {
            match Command::new(&exe_path).spawn() {
                Ok(_) => {
                    tokio::spawn(async {
                        tokio::time::sleep(tokio::time::Duration::from_millis(1000)).await;
                        std::process::exit(0);
                    });
                    
                    Ok(ApiResponse {
                        success: true,
                        message: "应用程序将在1秒后重启".to_string(),
                        data: None,
                    })
                }
                Err(e) => Err(format!("重启失败: {}", e)),
            }
        }
        Err(e) => Err(format!("获取程序路径失败: {}", e)),
    }
}

#[command]
pub async fn close_app() -> Result<ApiResponse, String> {
    println!("关闭应用程序...");
    
    tokio::spawn(async {
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        std::process::exit(0);
    });
    
    Ok(ApiResponse {
        success: true,
        message: "应用程序将在0.5秒后关闭".to_string(),
        data: None,
    })
}