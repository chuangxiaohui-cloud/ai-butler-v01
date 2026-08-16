#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct GatewayState(Mutex<Option<Child>>);

const GATEWAY_HOST: &str = "127.0.0.1";
const GATEWAY_PORT: u16 = 8787;

fn gateway_url() -> String {
    format!("http://{}:{}/", GATEWAY_HOST, GATEWAY_PORT)
}

fn strip_verbatim(path: &std::path::Path) -> PathBuf {
    let raw = path.to_string_lossy();
    PathBuf::from(raw.strip_prefix(r"\\?\").unwrap_or(&raw))
}

fn wait_for_gateway(timeout: Duration) -> std::io::Result<()> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if TcpStream::connect((GATEWAY_HOST, GATEWAY_PORT)).is_ok() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::TimedOut,
        "gateway 启动超时",
    ))
}

fn gateway_command(app: &tauri::AppHandle) -> (PathBuf, Vec<PathBuf>, PathBuf) {
    let resource_dir = app
        .path()
        .resource_dir()
        .expect("resource_dir 不可用");
    let packaged_entry = resource_dir
        .join("gateway")
        .join("dist")
        .join("gateway")
        .join("server.js");
    if packaged_entry.exists() {
        println!("[tauri] gateway mode: packaged");
        let node = strip_verbatim(&resource_dir.join("node.exe"));
        let data_dir = app.path().app_data_dir().unwrap();
        let entry = strip_verbatim(&packaged_entry);
        println!("[tauri] node: {}", node.display());
        println!("[tauri] entry: {}", entry.display());
        println!("[tauri] cwd: {}", data_dir.display());
        std::fs::create_dir_all(data_dir.join("data")).expect("userData/data 创建失败");
        return (node, vec![entry], data_dir);
    }

    println!("[tauri] gateway mode: dev");
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir.join("..").join("..");
    let tsx_cli = strip_verbatim(&repo_root.join("node_modules").join("tsx").join("dist").join("cli.mjs"));
    let source_entry = strip_verbatim(&repo_root.join("src").join("gateway").join("server.ts"));
    (PathBuf::from("node"), vec![tsx_cli, source_entry], repo_root)
}

fn spawn_gateway(app: &tauri::AppHandle) -> std::io::Result<Child> {
    let (node, args, cwd) = gateway_command(app);
    let mut command = Command::new(node);
    command
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    command.spawn()
}

fn kill_gateway(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<GatewayState>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn main() {
    let smoke = std::env::args().any(|arg| arg == "--smoke");
    let app = tauri::Builder::default()
        .setup(move |app| {
            let handle = app.handle().clone();
            let child = spawn_gateway(&handle)
                .map_err(|err| format!("gateway 启动失败：{err}"))?;
            handle.manage(GatewayState(Mutex::new(Some(child))));

            wait_for_gateway(Duration::from_secs(30))
                .map_err(|err| format!("gateway 未就绪：{err}"))?;

            let url = gateway_url()
                .parse()
                .map_err(|err| format!("URL 解析失败：{err}"))?;
            WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url))
                .title("一人公司 AI-Agent")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 700.0)
                .build()
                .map_err(|err| format!("窗口创建失败：{err}"))?;
            if smoke {
                println!("TAURI_READY");
                std::thread::sleep(Duration::from_secs(2));
                app.handle().exit(0);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Tauri 应用构建失败");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            kill_gateway(app_handle);
        }
    });
}
