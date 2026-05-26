Promise.all([
  fetch('./data/fundamentals.json').then(r => r.json()),
  fetch('./data/prices.json').then(r => r.json())
])
.then(([fundamentals, prices]) => {

  // 更新日時を表示
  document.getElementById('updated-at').textContent =
    '更新日時：' + fundamentals.updated_at;

  const list = document.getElementById('company-list');
  list.innerHTML = '';

  fundamentals.companies.forEach(company => {
    const f = company.financials;
    const filing = company.latest_filing || {};
    const priceData = prices[company.code];

    // 時価総額の計算
    let marketCap = null;
    if (priceData && f.shares_issued) {
      marketCap = priceData.price * f.shares_issued;
    }

    const periodLabel = formatPeriod(filing.period_end);

    const card = document.createElement('div');
    card.className = 'company-card';

    card.innerHTML = `
      <div class="company-name">${company.name}</div>
      <div class="company-code">証券コード：${company.code}</div>
      <div class="filing-info">
        <span>決算期：${periodLabel}</span>
        <span>提出日：${filing.submit_date || '不明'}</span>
      </div>
      <div class="financials">
        ${marketCap !== null ? `
        <div class="financial-row market-cap">
          <span class="financial-label">時価総額</span>
          <span class="financial-value">${formatAmount(marketCap)}</span>
        </div>
        ` : ''}
        <div class="financial-row">
          <span class="financial-label">売上高</span>
          <span class="financial-value">${formatAmount(f.sales)}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">営業利益</span>
          <span class="financial-value">${formatAmount(f.operating_profit)}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">当期純利益</span>
          <span class="financial-value">${formatAmount(f.net_income)}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">総資産</span>
          <span class="financial-value">${formatAmount(f.total_assets)}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">純資産</span>
          <span class="financial-value">${formatAmount(f.equity)}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">営業CF</span>
          <span class="financial-value">${formatAmount(f.operating_cf)}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">株価</span>
          <span class="financial-value">${priceData ? priceData.price.toLocaleString() + ' 円' : '不明'}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">発行済株式数</span>
          <span class="financial-value">${formatShares(f.shares_issued)}</span>
        </div>
      </div>
    `;

    list.appendChild(card);
  });
})
.catch(err => {
  document.getElementById('company-list').textContent =
    'データの読み込みに失敗しました：' + err.message;
});

// 「2025-03-31」→「2025年3月期」に変換
function formatPeriod(periodEnd) {
  if (!periodEnd) return '不明';
  const parts = periodEnd.split('-');
  if (parts.length < 2) return periodEnd;
  const year = parts[0];
  const month = parseInt(parts[1], 10);
  return `${year}年${month}月期`;
}

// 金額を「兆・億・万円」単位に変換
function formatAmount(value) {
  if (!value) return '不明';
  if (value >= 1_000_000_000_000) {
    return (value / 1_000_000_000_000).toFixed(1) + ' 兆円';
  } else if (value >= 100_000_000) {
    return (value / 100_000_000).toFixed(0) + ' 億円';
  } else if (value >= 10_000) {
    return (value / 10_000).toFixed(0) + ' 万円';
  }
  return value.toLocaleString() + ' 円';
}

// 株式数を「億株・万株」単位に変換
function formatShares(value) {
  if (!value) return '不明';
  if (value >= 100_000_000) {
    return (value / 100_000_000).toFixed(1) + ' 億株';
  } else if (value >= 10_000) {
    return (value / 10_000).toFixed(0) + ' 万株';
  }
  return value.toLocaleString() + ' 株';
}
// Service Worker登録
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/jp-stock-screener/sw.js')
      .then(() => console.log('SW登録成功'))
      .catch(err => console.log('SW登録失敗:', err));
  });
}