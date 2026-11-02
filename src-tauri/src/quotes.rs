use encoding_rs::GBK;
use reqwest::header;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

const QUOTE_ENDPOINT: &str = "https://qt.gtimg.cn/q=";
const MAX_SYMBOLS: usize = 20;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub symbol: String,
    pub name: String,
    pub code: String,
    pub market: String,
    pub price: f64,
    pub previous_close: f64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub change: f64,
    pub change_percent: f64,
    pub quote_time: String,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(8))
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) StockWidget/0.1")
            .build()
            .expect("failed to build the HTTP client")
    })
}

pub fn normalize_symbol(raw: &str) -> Option<String> {
    let lowered = raw.trim().to_ascii_lowercase();
    let is_digits = |value: &str| value.len() == 6 && value.bytes().all(|byte| byte.is_ascii_digit());

    for prefix in ["sh", "sz", "bj"] {
        if let Some(rest) = lowered.strip_prefix(prefix) {
            if is_digits(rest) {
                return Some(format!("{prefix}{rest}"));
            }
        }
    }

    if let Some(rest) = lowered.strip_prefix("bk") {
        let valid = (4..=8).contains(&rest.len())
            && rest
                .chars()
                .all(|character| character.is_ascii_alphanumeric());
        if valid {
            if rest.bytes().all(|byte| byte.is_ascii_digit()) {
                return Some(format!("bkBK{rest}"));
            }
            return Some(format!("bk{}", rest.to_ascii_uppercase()));
        }
    }

    if let Some(rest) = lowered.strip_prefix("us") {
        let valid = !rest.is_empty()
            && rest.len() <= 12
            && rest
                .chars()
                .all(|character| character.is_ascii_alphanumeric() || character == '.' || character == '-');
        if valid {
            return Some(format!("us{}", rest.to_ascii_uppercase()));
        }
    }

    None
}

fn normalize_symbols(symbols: Vec<String>) -> Result<Vec<String>, String> {
    if symbols.is_empty() {
        return Err("请至少提供一个行情代码".into());
    }

    let mut normalized = Vec::with_capacity(symbols.len());
    for raw in symbols {
        let symbol = normalize_symbol(&raw).ok_or_else(|| format!("无效的行情代码：{raw}"))?;
        if !normalized.contains(&symbol) {
            normalized.push(symbol);
        }
    }

    if normalized.len() > MAX_SYMBOLS {
        return Err(format!("一次最多查询 {MAX_SYMBOLS} 个行情代码"));
    }

    Ok(normalized)
}

pub async fn fetch_quotes(symbols: Vec<String>) -> Result<Vec<Quote>, String> {
    let symbols = normalize_symbols(symbols)?;
    let url = format!("{QUOTE_ENDPOINT}{}", symbols.join(","));

    let response = client()
        .get(url)
        .header(header::REFERER, "https://gu.qq.com/")
        .send()
        .await
        .map_err(|error| format!("请求行情失败：{error}"))?;

    if !response.status().is_success() {
        return Err(format!("行情接口返回 HTTP {}", response.status()));
    }

    let body = response
        .bytes()
        .await
        .map_err(|error| format!("读取行情失败：{error}"))?;
    let (text, _, _) = GBK.decode(&body);

    parse_response(&text, &symbols)
}

pub fn parse_response(body: &str, symbols: &[String]) -> Result<Vec<Quote>, String> {
    let mut parsed = HashMap::new();

    for entry in body.split(';') {
        let entry = entry.trim();
        let Some((key, value)) = entry.split_once('=') else {
            continue;
        };
        let key = key.trim().strip_prefix("v_").unwrap_or(key.trim());
        let value = value.trim().trim_matches('"');

        if let Some(quote) = parse_quote(key, value) {
            parsed.insert(key.to_ascii_lowercase(), quote);
        }
    }

    let mut result = Vec::with_capacity(symbols.len());
    for symbol in symbols {
        let mut quote = parsed
            .remove(&symbol.to_ascii_lowercase())
            .ok_or_else(|| format!("未找到 {symbol} 的行情数据"))?;
        quote.symbol = symbol.clone();
        result.push(quote);
    }

    Ok(result)
}

fn parse_quote(key: &str, raw: &str) -> Option<Quote> {
    let fields: Vec<&str> = raw.split('~').collect();
    if fields.len() < 35 {
        return None;
    }

    let price = parse_number(fields[3])?;
    let previous_close = parse_number(fields[4]).unwrap_or(price);
    let change = parse_number(fields[31]).unwrap_or(price - previous_close);
    let change_percent = parse_number(fields[32]).unwrap_or_else(|| {
        if previous_close == 0.0 {
            0.0
        } else {
            (price - previous_close) / previous_close * 100.0
        }
    });

    Some(Quote {
        symbol: key.to_string(),
        name: display_name(fields[1], key),
        code: display_code(fields[2], key),
        market: if key.to_ascii_lowercase().starts_with("us") {
            "us".into()
        } else {
            "cn".into()
        },
        price,
        previous_close,
        open: parse_number(fields[5]).unwrap_or(0.0),
        high: parse_number(fields[33]).unwrap_or(0.0),
        low: parse_number(fields[34]).unwrap_or(0.0),
        change,
        change_percent,
        quote_time: normalize_quote_time(fields[30]),
    })
}

fn parse_number(field: &str) -> Option<f64> {
    field
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
}

fn display_name(field: &str, symbol: &str) -> String {
    let name = field.trim();
    if name.is_empty() {
        symbol.to_string()
    } else {
        name.to_string()
    }
}

fn display_code(field: &str, symbol: &str) -> String {
    let raw = field.trim();
    if raw.is_empty() {
        return symbol.chars().skip(2).collect::<String>().to_ascii_uppercase();
    }

    let without_market_suffix = raw.strip_prefix('.').unwrap_or(raw);
    let base = without_market_suffix
        .split('.')
        .next()
        .unwrap_or(without_market_suffix);

    if base.is_empty() {
        symbol.chars().skip(2).collect::<String>().to_ascii_uppercase()
    } else {
        base.to_ascii_uppercase()
    }
}

fn normalize_quote_time(field: &str) -> String {
    let value = field.trim();
    if value.len() == 14 && value.bytes().all(|byte| byte.is_ascii_digit()) {
        return format!(
            "{}-{}-{} {}:{}:{}",
            &value[0..4],
            &value[4..6],
            &value[6..8],
            &value[8..10],
            &value[10..12],
            &value[12..14]
        );
    }

    if value.is_empty() {
        "--".into()
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(fields: &[(usize, &str)]) -> String {
        let mut values = vec![""; 88];
        for (index, value) in fields {
            values[*index] = value;
        }
        values.join("~")
    }

    #[test]
    fn normalizes_supported_symbols() {
        assert_eq!(normalize_symbol("SH000001").as_deref(), Some("sh000001"));
        assert_eq!(normalize_symbol(" sz399001 ").as_deref(), Some("sz399001"));
        assert_eq!(normalize_symbol("bj430047").as_deref(), Some("bj430047"));
        assert_eq!(normalize_symbol("bk1036").as_deref(), Some("bkBK1036"));
        assert_eq!(normalize_symbol("USaapl").as_deref(), Some("usAAPL"));
        assert_eq!(normalize_symbol("usBRK.A").as_deref(), Some("usBRK.A"));
    }

    #[test]
    fn rejects_invalid_symbols() {
        assert!(normalize_symbol("sh12345").is_none());
        assert!(normalize_symbol("sh000001&x=1").is_none());
        assert!(normalize_symbol("bk12").is_none());
        assert!(normalize_symbol("us").is_none());
        assert!(normalize_symbol("AAPL").is_none());
    }

    #[test]
    fn parses_cn_and_us_quotes_in_request_order() {
        let cn = sample(&[
            (0, "1"),
            (1, "上证指数"),
            (2, "000001"),
            (3, "3614.17"),
            (4, "3599.02"),
            (5, "3614.31"),
            (30, "20261102110400"),
            (31, "15.15"),
            (32, "0.42"),
            (33, "3625.14"),
            (34, "3594.77"),
        ]);
        let us = sample(&[
            (0, "200"),
            (1, "苹果"),
            (2, "AAPL.OQ"),
            (3, "344.63"),
            (4, "348.91"),
            (5, "346.72"),
            (30, "2026-10-30 16:00:02"),
            (31, "-4.28"),
            (32, "-1.23"),
            (33, "349.19"),
            (34, "334.35"),
        ]);
        let body = format!("v_sh000001=\"{cn}\";\nv_usAAPL=\"{us}\";");
        let symbols = vec!["sh000001".to_string(), "usAAPL".to_string()];

        let quotes = parse_response(&body, &symbols).expect("quotes should parse");

        assert_eq!(quotes.len(), 2);
        assert_eq!(quotes[0].symbol, "sh000001");
        assert_eq!(quotes[0].name, "上证指数");
        assert_eq!(quotes[0].market, "cn");
        assert_eq!(quotes[0].price, 3614.17);
        assert_eq!(quotes[0].change_percent, 0.42);
        assert_eq!(quotes[0].quote_time, "2026-11-02 11:04:00");

        assert_eq!(quotes[1].symbol, "usAAPL");
        assert_eq!(quotes[1].name, "苹果");
        assert_eq!(quotes[1].code, "AAPL");
        assert_eq!(quotes[1].market, "us");
        assert_eq!(quotes[1].quote_time, "2026-10-30 16:00:02");
    }

    #[test]
    fn strips_us_index_market_prefix_from_code() {
        let us = sample(&[
            (1, "纳斯达克"),
            (2, ".IXIC"),
            (3, "25437"),
            (4, "26184.72"),
        ]);

        let quote = parse_quote("usIXIC", &us).expect("quote should parse");
        assert_eq!(quote.code, "IXIC");
    }

    #[test]
    fn reports_missing_symbols() {
        let body = "v_sh000001=\"1~上证指数~000001~3614.17~3599.02\";";
        let symbols = vec!["sz399001".to_string()];

        assert!(parse_response(body, &symbols).is_err());
    }

    #[tokio::test]
    #[ignore = "hits the live Tencent quote endpoint"]
    async fn fetches_live_quotes() {
        let quotes = fetch_quotes(vec!["sh000001".into(), "usAAPL".into()])
            .await
            .expect("live quotes should load");

        assert_eq!(quotes.len(), 2);
        for quote in &quotes {
            assert!(!quote.name.is_empty());
            assert!(quote.price > 0.0);
        }
    }
}
