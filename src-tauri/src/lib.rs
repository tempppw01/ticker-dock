mod intraday;
mod quotes;
mod sectors;

use intraday::{fetch_intraday, Intraday};
use quotes::{fetch_quotes, Quote};
use sectors::{fetch_sectors, SectorInfo};

#[tauri::command]
async fn get_quotes(symbols: Vec<String>) -> Result<Vec<Quote>, String> {
  fetch_quotes(symbols).await
}

#[tauri::command]
async fn get_intraday(symbol: String) -> Result<Intraday, String> {
  fetch_intraday(symbol).await
}

#[tauri::command]
async fn get_sectors(custom: Vec<String>) -> Result<Vec<Quote>, String> {
  fetch_sectors(custom).await
}

#[tauri::command]
async fn search_sectors(query: String) -> Result<Vec<SectorInfo>, String> {
  sectors::search_sectors(query).await
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
      get_quotes,
      get_intraday,
      get_sectors,
      search_sectors
    ])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
