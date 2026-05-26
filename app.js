let allData = [];
let pricesData = {};
let currentSort = 'market_cap';

Promise.all([
  fetch('./data/fundamentals.json').then(r => r.json()),
  fetch('./data/prices.json').then(r => r.json())
])
.then(([fundamentals, prices]) => {
  pricesData = prices;

  // 更新日時を表示
  document.getElementById('updated-at').textContent =
    '更新日時：' + fundamentals.updated_at;

  // 時価総額を計算して保存
  allData = fundamentals.companies.map(company => {
    const priceData = prices[company.code];
    const shares = company.financials.shares_issued;
    const marketCap = (priceData && shares)
      ? priceData.price * shares
      : null;

    const f = company.financials;
    const per = (marketCap && f.net_income)
      ? marketCap / f.net_income : null;
    const pbr = (marketCap && f.equity)
      ? marketCap / f.equity : null;
    const roe = (f.net_income && f.equity)
      ? f.net_income / f.equity * 100 : null;
    const roa = (f.net_income && f.total_assets)
      ? f.net_income / f.total_assets * 100 : null;
    const operating_margin = (f.operating_profit && f.sales)
      ? f.operating_profit / f.sales * 100 : null;

    return { ...company, marketCap, priceData, per, pbr, roe, roa, operating_margin };
  });

  renderList(currentSort);
})
.catch(err => {
  document.getElementById('company-list').textContent =
    'データの読み込みに失敗しました：' + err.message;
});


function sortBy(key) {
  currentSort = key;

  // ボタンのアクティブ状態を更新
  document.querySelectorAll('#sort-bar button').forEach(btn => {
    btn.classList.remove('active');
  });
  event.target.classList.add('active');

  renderList(key);
}


function renderList(sortKey) {
  const sorted = [...allData].sort((a, b) => {
    let valA, valB;

    if (sortKey === 'market_cap') {
      valA = a.marketCap || 0;
      valB = b.marketCap || 0;
    } else if (['per', 'pbr', 'roe', 'roa', 'operating_margin'].includes(sortKey)) {
      valA = a[sortKey] || 0;
      valB = b[sortKey] || 0;
    } else {
      valA = a.financials[sortKey] || 0;
      valB = b.financials[sortKey] || 0;
    }

    return valB - valA;
  });

  const list = document.getElementById('company-list');
  list.innerHTML = '';

  sorted.forEach(company => {
    const f = company.financials;
    const filing = company.latest_filing || {};
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
        ${company.marketCap !== null ? `
        <div class="financial-row market-cap">
          <span class="financial-label">時価総額</span>
          <span class="financial-value">${formatAmount(company.marketCap)}</span>
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
          ${company.per !== null ? `
        <div class="financial-row">
          <span class="financial-label">PER</span>
          <span class="financial-value">${company.per.toFixed(1)} 倍</span>
        </div>
        ` : ''}
        ${company.pbr !== null ? `
        <div class="financial-row">
          <span class="financial-label">PBR</span>
          <span class="financial-value">${company.pbr.toFixed(1)} 倍</span>
        </div>
        ` : ''}
        ${company.roe !== null ? `
        <div class="financial-row">
          <span class="financial-label">ROE</span>
          <span class="financial-value">${company.roe.toFixed(1)} %</span>
        </div>
        ` : ''}
        ${company.roa !== null ? `
        <div class="financial-row">
          <span class="financial-label">ROA</span>
          <span class="financial-value">${company.roa.toFixed(1)} %</span>
        </div>
        ` : ''}
        ${company.operating_margin !== null ? `
        <div class="financial-row">
          <span class="financial-label">営業利益率</span>
          <span class="financial-value">${company.operating_margin.toFixed(1)} %</span>
        </div>
        ` : ''}
        <div class="financial-row">
          <span class="financial-label">株価</span>
          <span class="financial-value">${company.priceData ? company.priceData.price.toLocaleString() + ' 円' : '不明'}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">発行済株式数</span>
          <span class="financial-value">${formatShares(f.shares_issued)}</span>
        </div>
      </div>
    `;

    list.appendChild(card);
  });
}


function formatPeriod(periodEnd) {
  if (!periodEnd) return '不明';
  const parts = periodEnd.split('-');
  if (parts.length < 2) return periodEnd;
  return `${parts[0]}年${parseInt(parts[1], 10)}月期`;
}

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