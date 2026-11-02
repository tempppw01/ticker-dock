use crate::quotes::Quote;
use reqwest::header;
use serde::Serialize;
use serde_json::Value;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const SECTORS_ENDPOINT: &str = "https://push2.eastmoney.com/api/qt/clist/get";
const SECTOR_QUOTES_ENDPOINT: &str = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const SECTOR_COUNT: usize = 12;
const SECTOR_DIRECTORY_PAGE_SIZE: usize = 100;
const SECTOR_DIRECTORY_TTL: Duration = Duration::from_secs(600);
const MAX_SECTOR_RESULTS: usize = 8;
const MAX_CUSTOM_SECTORS: usize = 20;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectorInfo {
    pub code: String,
    pub name: String,
}

struct DirectoryCache {
    fetched_at: Instant,
    items: Vec<SectorInfo>,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) StockWidget/0.1")
            .build()
            .expect("failed to build the HTTP client")
    })
}

fn directory_cache() -> &'static Mutex<Option<DirectoryCache>> {
    static CACHE: OnceLock<Mutex<Option<DirectoryCache>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

pub async fn fetch_sectors(custom: Vec<String>) -> Result<Vec<Quote>, String> {
    let mut sectors = Vec::new();

    if !custom.is_empty() {
        if let Ok(quotes) = fetch_sector_quotes(&custom).await {
            sectors.extend(quotes);
        }
    }

    match fetch_sector_leaderboard().await {
        Ok(leaderboard) => {
            sectors = merge_unique(sectors, leaderboard);
        }
        Err(error) => {
            if sectors.is_empty() {
                return Err(error);
            }
        }
    }

    if sectors.is_empty() {
        return Err("暂无板块行情".into());
    }

    Ok(sectors)
}

async fn fetch_sector_leaderboard() -> Result<Vec<Quote>, String> {
    let count = SECTOR_COUNT.to_string();
    let response = client()
        .get(SECTORS_ENDPOINT)
        .query(&[
            ("pn", "1"),
            ("pz", count.as_str()),
            ("po", "1"),
            ("np", "1"),
            ("fltt", "2"),
            ("invt", "2"),
            ("fid", "f3"),
            ("fs", "m:90+t:2,m:90+t:3"),
            ("fields", "f2,f3,f4,f12,f14,f15,f16,f17,f18"),
        ])
        .header(header::REFERER, "https://quote.eastmoney.com/")
        .send()
        .await
        .map_err(|error| format!("请求板块行情失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("板块接口返回 HTTP {}", response.status()));
    }

    let body = response
        .text()
        .await
        .map_err(|error| format!("读取板块行情失败：{error}"))?;
    parse_sectors(&body)
}

async fn fetch_sector_quotes(codes: &[String]) -> Result<Vec<Quote>, String> {
    let normalized = normalize_sector_codes(codes)?;
    let secids = normalized
        .iter()
        .map(|code| format!("90.{code}"))
        .collect::<Vec<_>>()
        .join(",");

    let response = client()
        .get(SECTOR_QUOTES_ENDPOINT)
        .query(&[
            ("fltt", "2"),
            ("invt", "2"),
            ("fields", "f2,f3,f4,f12,f13,f14,f15,f16,f17,f18"),
            ("secids", secids.as_str()),
        ])
        .header(header::REFERER, "https://quote.eastmoney.com/")
        .send()
        .await
        .map_err(|error| format!("请求自选板块失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("自选板块接口返回 HTTP {}", response.status()));
    }

    let body = response
        .text()
        .await
        .map_err(|error| format!("读取自选板块失败：{error}"))?;
    let quotes = parse_sector_quotes_response(&body)?;

    let mut ordered = Vec::with_capacity(normalized.len());
    for code in normalized {
        if let Some(quote) = quotes.iter().find(|quote| quote.code == code) {
            ordered.push(quote.clone());
        }
    }

    if ordered.is_empty() {
        return Err("暂无自选板块行情".into());
    }

    Ok(ordered)
}

pub async fn search_sectors(query: String) -> Result<Vec<SectorInfo>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let items = sector_directory().await?;
    Ok(search_directory(&items, &query))
}

async fn sector_directory() -> Result<Vec<SectorInfo>, String> {
    if let Ok(cache) = directory_cache().lock() {
        if let Some(cache) = cache.as_ref() {
            if cache.fetched_at.elapsed() < SECTOR_DIRECTORY_TTL {
                return Ok(cache.items.clone());
            }
        }
    }

    let items = fetch_sector_directory().await?;
    if let Ok(mut cache) = directory_cache().lock() {
        *cache = Some(DirectoryCache {
            fetched_at: Instant::now(),
            items: items.clone(),
        });
    }
    Ok(items)
}

async fn fetch_sector_directory() -> Result<Vec<SectorInfo>, String> {
    let mut items: Vec<SectorInfo> = Vec::new();
    let mut total = 0usize;
    let mut page = 1usize;

    while page <= 30 && (total == 0 || items.len() < total) {
        let page_text = page.to_string();
        let page_size = SECTOR_DIRECTORY_PAGE_SIZE.to_string();
        let response = client()
            .get(SECTORS_ENDPOINT)
            .query(&[
                ("pn", page_text.as_str()),
                ("pz", page_size.as_str()),
                ("po", "1"),
                ("np", "1"),
                ("fltt", "2"),
                ("invt", "2"),
                ("fid", "f3"),
                ("fs", "m:90+t:2,m:90+t:3"),
                ("fields", "f12,f14"),
            ])
            .header(header::REFERER, "https://quote.eastmoney.com/")
            .send()
            .await
            .map_err(|error| format!("请求板块目录失败：{error}"))?;

        if !response.status().is_success() {
            return Err(format!("板块目录接口返回 HTTP {}", response.status()));
        }

        let body = response
            .text()
            .await
            .map_err(|error| format!("读取板块目录失败：{error}"))?;
        let payload: Value =
            serde_json::from_str(&body).map_err(|error| format!("解析板块目录失败：{error}"))?;
        let Some(data) = payload.get("data").filter(|value| !value.is_null()) else {
            break;
        };

        if page == 1 {
            total = data
                .get("total")
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize;
        }

        let Some(rows) = data.get("diff").and_then(Value::as_array) else {
            break;
        };
        if rows.is_empty() {
            break;
        }

        for row in rows {
            let Some(code) = row.get("f12").and_then(Value::as_str) else {
                continue;
            };
            let Some(name) = row.get("f14").and_then(Value::as_str) else {
                continue;
            };
            let code = code.trim().to_ascii_uppercase();
            let name = name.trim();
            if !code.starts_with("BK") || name.is_empty() {
                continue;
            }
            if !items.iter().any(|item| item.code == code) {
                items.push(SectorInfo {
                    code,
                    name: name.to_string(),
                });
            }
        }

        page += 1;
    }

    if items.is_empty() {
        return Err("暂无板块目录".into());
    }

    Ok(items)
}

pub fn parse_sectors(body: &str) -> Result<Vec<Quote>, String> {
    let payload: Value =
        serde_json::from_str(body).map_err(|error| format!("解析板块行情失败：{error}"))?;
    let rows = payload
        .pointer("/data/diff")
        .and_then(Value::as_array)
        .ok_or_else(|| "板块行情格式不正确".to_string())?;

    let mut sectors = parse_quote_rows(rows);
    sectors.sort_by(|left, right| {
        right
            .change_percent
            .partial_cmp(&left.change_percent)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    sectors.truncate(SECTOR_COUNT);

    if sectors.is_empty() {
        return Err("暂无板块行情".into());
    }

    Ok(sectors)
}

pub fn parse_sector_quotes_response(body: &str) -> Result<Vec<Quote>, String> {
    let payload: Value =
        serde_json::from_str(body).map_err(|error| format!("解析自选板块失败：{error}"))?;
    let rows = payload
        .pointer("/data/diff")
        .and_then(Value::as_array)
        .ok_or_else(|| "自选板块格式不正确".to_string())?;
    let quotes = parse_quote_rows(rows);

    if quotes.is_empty() {
        return Err("暂无自选板块行情".into());
    }

    Ok(quotes)
}

fn parse_quote_rows(rows: &[Value]) -> Vec<Quote> {
    let mut quotes = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(code) = row.get("f12").and_then(Value::as_str) else {
            continue;
        };
        let Some(name) = row.get("f14").and_then(Value::as_str) else {
            continue;
        };
        let Some(price) = number(row.get("f2")) else {
            continue;
        };
        if price <= 0.0 || name.trim().is_empty() {
            continue;
        }

        let code = code.trim().to_ascii_uppercase();
        let change = number(row.get("f4")).unwrap_or(0.0);
        let previous_close = number(row.get("f18")).unwrap_or(price - change);
        let change_percent = number(row.get("f3")).unwrap_or_else(|| {
            if previous_close == 0.0 {
                0.0
            } else {
                (price - previous_close) / previous_close * 100.0
            }
        });

        quotes.push(Quote {
            symbol: format!("bk{code}"),
            name: name.trim().to_string(),
            code,
            market: "cn".into(),
            price,
            previous_close,
            open: number(row.get("f17")).unwrap_or(price),
            high: number(row.get("f15")).unwrap_or(price),
            low: number(row.get("f16")).unwrap_or(price),
            change,
            change_percent,
            quote_time: "--".into(),
        });
    }
    quotes
}

fn search_directory(items: &[SectorInfo], query: &str) -> Vec<SectorInfo> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Vec::new();
    }

    let mut matches = items
        .iter()
        .filter_map(|item| {
            let name = item.name.to_lowercase();
            let code = item.code.to_lowercase();
            let rank = if name == needle || code == needle {
                0
            } else if name.starts_with(&needle) || code.starts_with(&needle) {
                1
            } else if name.contains(&needle) || code.contains(&needle) {
                2
            } else {
                return None;
            };
            Some((rank, item.name.chars().count(), item))
        })
        .collect::<Vec<_>>();

    matches.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then(left.1.cmp(&right.1))
            .then(left.2.code.cmp(&right.2.code))
    });

    matches
        .into_iter()
        .take(MAX_SECTOR_RESULTS)
        .map(|(_, _, item)| item.clone())
        .collect()
}

fn merge_unique(custom: Vec<Quote>, leaderboard: Vec<Quote>) -> Vec<Quote> {
    let mut result = custom;
    for quote in leaderboard {
        if !result.iter().any(|item| item.symbol == quote.symbol) {
            result.push(quote);
        }
    }
    result
}

fn normalize_sector_codes(codes: &[String]) -> Result<Vec<String>, String> {
    if codes.is_empty() {
        return Err("请至少提供一个板块代码".into());
    }

    let mut normalized = Vec::with_capacity(codes.len());
    for raw in codes {
        let code = normalize_sector_code(raw).ok_or_else(|| format!("无效的板块代码：{raw}"))?;
        if !normalized.contains(&code) {
            normalized.push(code);
        }
    }

    if normalized.len() > MAX_CUSTOM_SECTORS {
        return Err(format!("一次最多查询 {MAX_CUSTOM_SECTORS} 个板块"));
    }

    Ok(normalized)
}

fn normalize_sector_code(raw: &str) -> Option<String> {
    let value = raw.trim().to_ascii_uppercase();
    let body = value.strip_prefix("BK").unwrap_or(&value);
    let valid = (3..=8).contains(&body.len())
        && body
            .chars()
            .all(|character| character.is_ascii_alphanumeric());
    valid.then(|| format!("BK{body}"))
}

fn number(value: Option<&Value>) -> Option<f64> {
    value
        .and_then(|value| {
            value.as_f64().or_else(|| {
                value
                    .as_str()
                    .and_then(|raw| raw.trim().parse::<f64>().ok())
            })
        })
        .filter(|value| value.is_finite())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_and_sorts_sector_quotes() {
        let body = json!({
            "data": {
                "diff": [
                    {"f2": 2050.58, "f3": 3.06, "f4": 60.91, "f12": "BK1036", "f14": "半导体", "f15": 2074.66, "f16": 1971.14, "f17": 2015.29, "f18": 1989.67},
                    {"f2": 918.72, "f3": 10.34, "f4": 86.07, "f12": "BK1761", "f14": "AI视频", "f15": 927.74, "f16": 818.91, "f17": 830.23, "f18": 832.65},
                    {"f2": "-", "f3": "-", "f4": "-", "f12": "BK0000", "f14": "无效板块"}
                ]
            }
        })
        .to_string();

        let sectors = parse_sectors(&body).expect("sectors should parse");

        assert_eq!(sectors.len(), 2);
        assert_eq!(sectors[0].symbol, "bkBK1761");
        assert_eq!(sectors[0].name, "AI视频");
        assert_eq!(sectors[0].change_percent, 10.34);
        assert_eq!(sectors[1].symbol, "bkBK1036");
        assert_eq!(sectors[1].previous_close, 1989.67);
        assert_eq!(sectors[1].high, 2074.66);
    }

    #[test]
    fn rejects_empty_sector_payloads() {
        assert!(parse_sectors(r#"{"data":{"diff":[]}}"#).is_err());
        assert!(parse_sectors(r#"{"data":null}"#).is_err());
    }

    #[test]
    fn parses_custom_sector_quotes_without_reordering() {
        let body = json!({
            "data": {
                "diff": [
                    {"f2": 1420.31, "f3": 0.86, "f4": 12.11, "f12": "BK0475", "f14": "银行Ⅱ", "f15": 1428.09, "f16": 1402.44, "f17": 1404.2, "f18": 1408.2},
                    {"f2": 1128.05, "f3": -0.32, "f4": -3.61, "f12": "BK1283", "f14": "银行", "f15": 1139.7, "f16": 1121.3, "f17": 1131.66, "f18": 1131.66}
                ]
            }
        })
        .to_string();

        let quotes =
            parse_sector_quotes_response(&body).expect("custom sector quotes should parse");

        assert_eq!(quotes.len(), 2);
        assert_eq!(quotes[0].code, "BK0475");
        assert_eq!(quotes[1].code, "BK1283");
        assert_eq!(quotes[1].name, "银行");
        assert_eq!(quotes[1].change_percent, -0.32);
    }

    #[test]
    fn normalizes_sector_codes() {
        assert_eq!(normalize_sector_code("bk1283").as_deref(), Some("BK1283"));
        assert_eq!(normalize_sector_code(" BK0475 ").as_deref(), Some("BK0475"));
        assert_eq!(normalize_sector_code("1611").as_deref(), Some("BK1611"));
        assert!(normalize_sector_code("").is_none());
        assert!(normalize_sector_code("BK").is_none());
        assert!(normalize_sector_code("BK12/34").is_none());
    }

    #[test]
    fn ranks_exact_name_before_prefix_and_partial_matches() {
        let directory = vec![
            SectorInfo {
                code: "BK0525".into(),
                name: "参股银行".into(),
            },
            SectorInfo {
                code: "BK1283".into(),
                name: "银行".into(),
            },
            SectorInfo {
                code: "BK0475".into(),
                name: "银行Ⅱ".into(),
            },
            SectorInfo {
                code: "BK1611".into(),
                name: "国有大型银行Ⅲ".into(),
            },
            SectorInfo {
                code: "BK1036".into(),
                name: "半导体".into(),
            },
        ];

        let results = search_directory(&directory, "银行");
        let names = results
            .iter()
            .map(|item| item.name.as_str())
            .collect::<Vec<_>>();

        assert_eq!(names, vec!["银行", "银行Ⅱ", "参股银行", "国有大型银行Ⅲ"]);

        let by_code = search_directory(&directory, "bk1283");
        assert_eq!(by_code.len(), 1);
        assert_eq!(by_code[0].name, "银行");
    }

    #[test]
    fn merges_custom_sectors_before_the_leaderboard() {
        let custom = vec![test_quote("bkBK1283", "银行", 0.8)];
        let leaderboard = vec![
            test_quote("bkBK1036", "半导体", 3.0),
            test_quote("bkBK1283", "银行", 0.8),
        ];

        let merged = merge_unique(custom, leaderboard);
        let codes = merged
            .iter()
            .map(|quote| quote.code.as_str())
            .collect::<Vec<_>>();

        assert_eq!(codes, vec!["BK1283", "BK1036"]);
    }

    fn test_quote(symbol: &str, name: &str, change_percent: f64) -> Quote {
        Quote {
            symbol: symbol.into(),
            name: name.into(),
            code: symbol.trim_start_matches("bk").into(),
            market: "cn".into(),
            price: 1000.0,
            previous_close: 990.0,
            open: 995.0,
            high: 1010.0,
            low: 990.0,
            change: 10.0,
            change_percent,
            quote_time: "--".into(),
        }
    }

    #[tokio::test]
    #[ignore = "hits the live Eastmoney sector endpoints"]
    async fn fetches_live_sectors_and_searches_banks() {
        let sectors = fetch_sectors(vec!["BK1283".into()])
            .await
            .expect("live sectors should load");

        assert!(!sectors.is_empty());
        assert_eq!(sectors[0].code, "BK1283");
        assert_eq!(sectors[0].name, "银行");
        assert!(sectors[0].price > 0.0);

        let matches = search_sectors("银行".into())
            .await
            .expect("live sector search should load");
        assert!(matches.iter().any(|item| item.code == "BK1283"));
    }
}
