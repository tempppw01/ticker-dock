use crate::quotes::normalize_symbol;
use reqwest::header;
use serde::Serialize;
use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;

const TRENDS_ENDPOINT: &str = "https://push2his.eastmoney.com/api/qt/stock/trends2/get";

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntradayPoint {
    pub time: String,
    pub price: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Intraday {
    pub symbol: String,
    pub previous_close: f64,
    pub points: Vec<IntradayPoint>,
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

pub fn secid_candidates(symbol: &str) -> Option<Vec<String>> {
    let symbol = normalize_symbol(symbol)?;

    for (prefix, market) in [("sh", "1"), ("sz", "0"), ("bj", "0")] {
        if let Some(code) = symbol.strip_prefix(prefix) {
            return Some(vec![format!("{market}.{code}")]);
        }
    }

    if let Some(code) = symbol.strip_prefix("bk") {
        return Some(vec![format!("90.{code}")]);
    }

    let ticker = symbol.strip_prefix("us")?;
    let index = match ticker {
        "IXIC" => Some("100.NDX"),
        "INX" | "SPX" => Some("100.SPX"),
        "DJI" => Some("100.DJIA"),
        _ => None,
    };
    if let Some(secid) = index {
        return Some(vec![secid.to_string()]);
    }

    let eastmoney_ticker = ticker.replace('.', "_");
    Some(
        ["105", "106", "107"]
            .into_iter()
            .map(|market| format!("{market}.{eastmoney_ticker}"))
            .collect(),
    )
}

pub async fn fetch_intraday(symbol: String) -> Result<Intraday, String> {
    let normalized =
        normalize_symbol(&symbol).ok_or_else(|| format!("无效的行情代码：{symbol}"))?;
    let candidates = secid_candidates(&normalized)
        .ok_or_else(|| format!("无法识别行情代码：{symbol}"))?;
    let mut last_error = None;

    for secid in candidates {
        match fetch_trends(&normalized, &secid).await {
            Ok(intraday) => return Ok(intraday),
            Err(error) => last_error = Some(error),
        }
    }

    Err(last_error.unwrap_or_else(|| format!("未找到 {normalized} 的分时数据")))
}

async fn fetch_trends(symbol: &str, secid: &str) -> Result<Intraday, String> {
    let response = client()
        .get(TRENDS_ENDPOINT)
        .query(&[
            ("secid", secid),
            (
                "fields1",
                "f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13",
            ),
            ("fields2", "f51,f52,f53,f54,f55,f56,f57,f58"),
            ("iscr", "0"),
            ("ndays", "1"),
        ])
        .header(header::REFERER, "https://quote.eastmoney.com/")
        .send()
        .await
        .map_err(|error| format!("请求分时数据失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("分时接口返回 HTTP {}", response.status()));
    }

    let body = response
        .text()
        .await
        .map_err(|error| format!("读取分时数据失败：{error}"))?;
    let payload: Value =
        serde_json::from_str(&body).map_err(|error| format!("解析分时数据失败：{error}"))?;

    parse_trends(symbol, &payload)
}

pub fn parse_trends(symbol: &str, payload: &Value) -> Result<Intraday, String> {
    let data = payload
        .get("data")
        .filter(|value| !value.is_null())
        .ok_or_else(|| format!("未找到 {symbol} 的分时数据"))?;

    let rows = data
        .get("trends")
        .and_then(Value::as_array)
        .ok_or_else(|| format!("{symbol} 的分时数据格式不正确"))?;

    let mut points = Vec::with_capacity(rows.len());
    for row in rows {
        let Some(raw) = row.as_str() else {
            continue;
        };
        let fields: Vec<&str> = raw.split(',').collect();
        if fields.len() < 3 {
            continue;
        }
        let Ok(price) = fields[2].trim().parse::<f64>() else {
            continue;
        };
        if !price.is_finite() || price <= 0.0 {
            continue;
        }

        let time = fields[0]
            .trim()
            .split_whitespace()
            .last()
            .unwrap_or(fields[0])
            .to_string();
        points.push(IntradayPoint { time, price });
    }

    if points.len() < 2 {
        return Err(format!("{symbol} 暂无分时走势"));
    }

    let previous_close = ["preClose", "prePrice", "preSettlement"]
        .into_iter()
        .find_map(|key| data.get(key).and_then(Value::as_f64))
        .filter(|value| value.is_finite() && *value > 0.0)
        .unwrap_or(points[0].price);

    Ok(Intraday {
        symbol: symbol.to_string(),
        previous_close,
        points,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_symbols_to_eastmoney_markets() {
        assert_eq!(secid_candidates("sh600519"), Some(vec!["1.600519".into()]));
        assert_eq!(secid_candidates("sz000001"), Some(vec!["0.000001".into()]));
        assert_eq!(secid_candidates("bkBK1036"), Some(vec!["90.BK1036".into()]));
        assert_eq!(secid_candidates("usAAPL"), Some(vec![
            "105.AAPL".into(),
            "106.AAPL".into(),
            "107.AAPL".into(),
        ]));
        assert_eq!(secid_candidates("usIXIC"), Some(vec!["100.NDX".into()]));
        assert!(secid_candidates("invalid").is_none());
    }

    #[test]
    fn parses_minute_trends() {
        let payload = json!({
            "data": {
                "preClose": 3599.02,
                "trends": [
                    "2026-11-02 09:30,3614.31,3614.31,3614.31,3614.31,6333952,8826942208.00,3611.430",
                    "2026-11-02 09:31,3612.82,3599.38,3612.82,3598.51,20265136,29202423808.00,3600.214"
                ]
            }
        });

        let intraday = parse_trends("sh000001", &payload).expect("trends should parse");
        assert_eq!(intraday.symbol, "sh000001");
        assert_eq!(intraday.previous_close, 3599.02);
        assert_eq!(intraday.points.len(), 2);
        assert_eq!(intraday.points[0].time, "09:30");
        assert_eq!(intraday.points[1].price, 3599.38);
    }

    #[test]
    fn rejects_empty_trends() {
        let payload = json!({ "data": { "trends": [] } });
        assert!(parse_trends("usAAPL", &payload).is_err());
    }

    #[tokio::test]
    #[ignore = "hits the live Eastmoney trends endpoint"]
    async fn fetches_live_cn_and_us_trends() {
        for symbol in ["sh000001", "usAAPL", "bkBK1036"] {
            let intraday = fetch_intraday(symbol.into())
                .await
                .expect("live trends should load");
            assert!(intraday.points.len() > 2);
            assert!(intraday.previous_close > 0.0);
        }
    }
}
