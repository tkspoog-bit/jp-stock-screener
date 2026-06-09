let allData = [];
let pricesData = {};
let currentSort = 'market_cap';
let currentMarketFilter = null;
let currentIndustryFilter = '';
let portfolios = {};
let currentPortfolio = null;
let currentTab = 'screen';
let filteredData = [];

// データ読み込み
Promise.all([
  fetch('./data/fundamentals.json').then(r => r.json()),
  fetch('./data/prices.json').then(r => r.json())
])
.then(([fundamentals, prices]) => {
  pricesData = prices;
  document.getElementById('updated-at').textContent = fundamentals.updated_at;

  allData = fundamentals.companies.map(company => {
    const priceData = prices[company.code];
    const shares = company.financials.shares_issued;
    const marketCap = (priceData && shares) ? priceData.price * shares : null;
    const f = company.financials;
    const per = (marketCap && f.net_income && f.net_income > 0) ? marketCap / f.net_income : null;
    const pbr = (marketCap && f.equity) ? marketCap / f.equity : null;
    const roe = (f.net_income && f.equity) ? f.net_income / f.equity * 100 : null;
    const roa = (f.net_income && f.total_assets) ? f.net_income / f.total_assets * 100 : null;
    const operating_margin = (f.operating_profit && f.sales) ? f.operating_profit / f.sales * 100 : null;
    const net_cash_ratio = (f.net_cash && marketCap) ? f.net_cash / marketCap * 100 : null;
    const net_net_ratio = (f.net_net !== undefined && f.net_net !== null && marketCap) ? f.net_net / marketCap : null;
    return { ...company, marketCap, priceData, per, pbr, roe, roa, operating_margin, net_cash_ratio, net_net_ratio };
  });

  // 業種リスト生成
  const industries = [...new Set(allData.map(c => c.industry_name).filter(Boolean))].sort();
  const select = document.getElementById('industry-select');
  industries.forEach(ind => {
    const opt = document.createElement('option');
    opt.value = ind;
    opt.textContent = ind;
    select.appendChild(opt);
  });

  initPortfolios();
  filteredData = [...allData];
  renderPortfolioScreen();
})
.catch(err => {
  console.error(err);
});

// タブ切り替え
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tab}-screen`).classList.add('active');
  document.getElementById(`nav-${tab}`).classList.add('active');
  if (tab === 'result') renderList();
  if (tab === 'portfolio') renderPortfolioScreen();
}

// 結果画面へ
function goToResults() {
  applyFilters();
  switchTab('result');
}

// フィルタ適用
function applyFilters() {
  const perMax = parseFloat(document.getElementById('filter-per').value);
  const roeMin = parseFloat(document.getElementById('filter-roe').value);
  const marginMin = parseFloat(document.getElementById('filter-margin').value);
  const capMax = parseFloat(document.getElementById('filter-cap').value);
  const ncpMin = parseFloat(document.getElementById('filter-ncp').value);
  const nnMin = parseFloat(document.getElementById('filter-nn').value);

  let filtered = allData;

  if (currentMarketFilters.length > 0) {
    filtered = filtered.filter(c => currentMarketFilters.includes(c.market));
  }
  if (currentIndustryFilter) {
    filtered = filtered.filter(c => c.industry_name === currentIndustryFilter);
  }
  const PER_MAX = 100, ROE_MAX = 30, MARGIN_MAX = 30, CAP_MAX = 5000, NCP_MAX = 50, NN_MAX = 2.0;
  const PER_MIN = 5, ROE_MIN = 5, MARGIN_MIN = 5, CAP_MIN = 50, NCP_MIN = 0, NN_MIN = 0.3;

  if (!isNaN(perMax)) {
    if (perMax >= PER_MAX) filtered = filtered.filter(c => c.per !== null && c.per >= perMax);
    else filtered = filtered.filter(c => c.per !== null && c.per <= perMax);
  }
  if (!isNaN(roeMin)) {
    if (roeMin <= ROE_MIN) filtered = filtered.filter(c => c.roe !== null && c.roe <= roeMin);
    else filtered = filtered.filter(c => c.roe !== null && c.roe >= roeMin);
  }
  if (!isNaN(marginMin)) {
    if (marginMin <= MARGIN_MIN) filtered = filtered.filter(c => c.operating_margin !== null && c.operating_margin <= marginMin);
    else filtered = filtered.filter(c => c.operating_margin !== null && c.operating_margin >= marginMin);
  }
  if (!isNaN(capMax)) {
    if (capMax >= CAP_MAX) filtered = filtered.filter(c => c.marketCap !== null && c.marketCap >= capMax * 100000000);
    else filtered = filtered.filter(c => c.marketCap !== null && c.marketCap <= capMax * 100000000);
  }
  if (!isNaN(ncpMin)) {
    if (ncpMin <= NCP_MIN) filtered = filtered.filter(c => c.net_cash_ratio !== null && c.net_cash_ratio <= ncpMin);
    else filtered = filtered.filter(c => c.net_cash_ratio !== null && c.net_cash_ratio >= ncpMin);
  }
  if (!isNaN(nnMin)) {
    if (nnMin <= NN_MIN) filtered = filtered.filter(c => c.net_net_ratio !== null && c.net_net_ratio <= nnMin);
    else filtered = filtered.filter(c => c.net_net_ratio !== null && c.net_net_ratio >= nnMin);
  }

  filteredData = filtered;
}

// 結果画面のフィルタ（検索）
function filterList() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  let data = filteredData;

  if (currentPortfolio && portfolios[currentPortfolio]) {
    const codes = portfolios[currentPortfolio].codes;
    data = allData.filter(c => codes.includes(c.code));
  }

  if (query) {
    data = data.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.code.toLowerCase().includes(query)
    );
  }

  renderList(data);
}

let currentMarketFilters = [];

function setFilter(type, value, btn) {
  if (value === null) {
    currentMarketFilters = [];
    document.querySelectorAll('.btn-group button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    return;
  }
  if (currentMarketFilters.includes(value)) {
    currentMarketFilters = currentMarketFilters.filter(v => v !== value);
    btn.classList.remove('active');
  } else {
    currentMarketFilters.push(value);
    btn.classList.add('active');
    document.querySelector('.btn-group button').classList.remove('active');
  }
  if (currentMarketFilters.length === 0) {
    document.querySelector('.btn-group button').classList.add('active');
  }
}

function setIndustryFilter(value) {
  currentIndustryFilter = value;
}

function sortBy(key) {
  currentSort = key;
  renderList();
}

function clearScreenFilter() {
  currentMarketFilters = [];
  currentIndustryFilter = '';
  document.querySelectorAll('.btn-group button').forEach(b => b.classList.remove('active'));
  document.querySelector('.btn-group button').classList.add('active');
  document.getElementById('industry-select').value = '';
  document.getElementById('filter-per').value = '';
  document.getElementById('filter-roe').value = '';
  document.getElementById('filter-margin').value = '';
  document.getElementById('filter-cap').value = '';
  document.getElementById('filter-ncp').value = '';
  document.getElementById('filter-nn').value = '';
}

// 結果描画
function renderList(data) {
  if (!data) {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    data = currentPortfolio && portfolios[currentPortfolio]
      ? allData.filter(c => portfolios[currentPortfolio].codes.includes(c.code))
      : filteredData;
    if (query) {
      data = data.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
      );
    }
  }

  const sorted = [...data].sort((a, b) => {
    let valA, valB;
    if (['per','pbr','roe','roa','operating_margin','net_cash_ratio','net_net_ratio'].includes(currentSort)) {
      valA = a[currentSort] || 0;
      valB = b[currentSort] || 0;
    } else if (currentSort === 'market_cap') {
      valA = a.marketCap || 0;
      valB = b.marketCap || 0;
    } else {
      valA = a.financials[currentSort] || 0;
      valB = b.financials[currentSort] || 0;
    }
    return valB - valA;
  });

  const count = document.getElementById('result-count');
  count.textContent = `${sorted.length} 件`;

  const list = document.getElementById('company-list');
  list.innerHTML = '';

  sorted.forEach(company => {
    const f = company.financials;
    const filing = company.latest_filing || {};
    const periodLabel = formatPeriod(filing.period_end);
    const inPf = Object.values(portfolios).some(pf => pf.codes.includes(company.code));
    const card = document.createElement('div');
    card.className = 'company-card';
    card.innerHTML = `
      <div class="company-header">
        <div class="company-name">${company.name}</div>
        <button class="pf-btn ${inPf ? 'in-pf' : ''}" onclick="togglePortfolio('${company.code}')">${inPf ? '★' : '☆'}</button>
      </div>
      <div class="company-code">証券コード：${company.code}${company.market ? `　${company.market}` : ''}${company.industry_name ? `　${company.industry_name}` : ''}</div>
      <div class="filing-info">
        <span>決算期：${periodLabel}</span>
        <span>提出日：${filing.submit_date || '不明'}</span>
      </div>
      <div class="financials">
        ${company.marketCap !== null ? `
        <div class="financial-row market-cap">
          <span class="financial-label">時価総額</span>
          <span class="financial-value">${formatAmount(company.marketCap)}</span>
        </div>` : ''}
        <div class="financial-row"><span class="financial-label">売上高</span><span class="financial-value">${formatAmount(f.sales)}</span></div>
        <div class="financial-row"><span class="financial-label">営業利益</span><span class="financial-value">${formatAmount(f.operating_profit)}</span></div>
        <div class="financial-row"><span class="financial-label">当期純利益</span><span class="financial-value">${formatAmount(f.net_income)}</span></div>
        <div class="financial-row"><span class="financial-label">総資産</span><span class="financial-value">${formatAmount(f.total_assets)}</span></div>
        <div class="financial-row"><span class="financial-label">純資産</span><span class="financial-value">${formatAmount(f.equity)}</span></div>
        ${f.operating_cf !== undefined ? `<div class="financial-row"><span class="financial-label">営業CF</span><span class="financial-value">${formatAmount(f.operating_cf)}</span></div>` : ''}
        ${f.investing_cf !== undefined ? `<div class="financial-row"><span class="financial-label">投資CF</span><span class="financial-value">${formatAmount(f.investing_cf)}</span></div>` : ''}
        ${f.dividend_per_share !== undefined ? `<div class="financial-row"><span class="financial-label">1株配当</span><span class="financial-value">${f.dividend_per_share} 円</span></div>` : ''}
        <div class="metrics-grid">
          ${company.per !== null ? `<div class="metric-item"><span class="metric-label">PER</span><span class="metric-value">${company.per.toFixed(1)} 倍</span></div>` : ''}
          ${company.pbr !== null ? `<div class="metric-item"><span class="metric-label">PBR</span><span class="metric-value">${company.pbr.toFixed(1)} 倍</span></div>` : ''}
          ${company.roe !== null ? `<div class="metric-item"><span class="metric-label">ROE</span><span class="metric-value">${company.roe.toFixed(1)} %</span></div>` : ''}
          ${company.roa !== null ? `<div class="metric-item"><span class="metric-label">ROA</span><span class="metric-value">${company.roa.toFixed(1)} %</span></div>` : ''}
          ${company.operating_margin !== null ? `<div class="metric-item"><span class="metric-label">営業利益率</span><span class="metric-value">${company.operating_margin.toFixed(1)} %</span></div>` : ''}
          ${company.net_cash_ratio !== null ? `<div class="metric-item"><span class="metric-label">NC比率</span><span class="metric-value">${company.net_cash_ratio.toFixed(1)} %</span></div>` : ''}
          ${company.net_net_ratio !== null ? `<div class="metric-item"><span class="metric-label">ネットネット</span><span class="metric-value">${company.net_net_ratio.toFixed(2)} 倍</span></div>` : ''}
        </div>
        <div class="financial-row"><span class="financial-label">参考株価</span><span class="financial-value">${company.priceData ? company.priceData.price.toLocaleString() + ' 円（' + company.priceData.date + '）' : '不明'}</span></div>
        <div class="financial-row"><span class="financial-label">発行済株式数</span><span class="financial-value">${formatShares(f.shares_issued)}</span></div>
      </div>
    `;
    list.appendChild(card);
  });
}

// ポートフォリオ画面描画
function renderPortfolioScreen() {
  const list = document.getElementById('portfolio-list');
  list.innerHTML = '';
  if (Object.keys(portfolios).length === 0) {
    list.innerHTML = '<p style="color:#aaa;text-align:center;padding:32px">ポートフォリオがありません</p>';
    return;
  }
  Object.entries(portfolios).forEach(([key, pf]) => {
    const card = document.createElement('div');
    card.className = 'pf-card';
    card.innerHTML = `
      <div onclick="showPortfolio('${key}')">
        <div class="pf-card-name">${pf.name}</div>
        <div class="pf-card-count">${pf.codes.length} 銘柄</div>
      </div>
      <div class="pf-card-actions">
        <button onclick="deletePortfolio('${key}')">削除</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function showPortfolio(key) {
  currentPortfolio = key;
  switchTab('result');
}

function addPortfolio() {
  const name = prompt('ポートフォリオ名を入力してください');
  if (!name) return;
  const i = Object.keys(portfolios).length + 1;
  portfolios[`p${i}`] = { name, codes: [] };
  updateURL();
  renderPortfolioScreen();
}

function deletePortfolio(key) {
  if (confirm(`「${portfolios[key].name}」を削除しますか？`)) {
    delete portfolios[key];
    if (currentPortfolio === key) currentPortfolio = null;
    updateURL();
    renderPortfolioScreen();
  }
}

function togglePortfolio(code) {
  if (Object.keys(portfolios).length === 0) {
    alert('先にポートフォリオを作成してください');
    return;
  }
  if (currentPortfolio && portfolios[currentPortfolio]) {
    if (portfolios[currentPortfolio].codes.includes(code)) {
      if (confirm('お気に入りから削除しますか？')) {
        portfolios[currentPortfolio].codes = portfolios[currentPortfolio].codes.filter(c => c !== code);
        updateURL();
        renderList();
        renderPortfolioScreen();
      }
      return;
    }
  }
  const keys = Object.keys(portfolios);
  if (keys.length === 1) {
    portfolios[keys[0]].codes.push(code);
    updateURL();
    renderList();
    renderPortfolioScreen();
    return;
  }
  const key = prompt('追加先:\n' + keys.map(k => `${k}: ${portfolios[k].name}`).join('\n') + '\n\nキーを入力（例: p1）');
  if (key && portfolios[key]) {
    portfolios[key].codes.push(code);
    updateURL();
    renderList();
    renderPortfolioScreen();
  }
}

function initPortfolios() {
  const params = new URLSearchParams(window.location.search);
  portfolios = {};
  let i = 1;
  while (params.has(`p${i}`)) {
    const codes = params.get(`p${i}`).split(',').filter(Boolean);
    const name = params.get(`p${i}name`) || `ポートフォリオ${i}`;
    portfolios[`p${i}`] = { name, codes };
    i++;
  }
}

function updateURL() {
  const params = new URLSearchParams();
  Object.entries(portfolios).forEach(([key, pf]) => {
    const i = key.replace('p', '');
    params.set(`p${i}`, pf.codes.join(','));
    params.set(`p${i}name`, pf.name);
  });
  const newURL = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
  window.history.replaceState({}, '', newURL);
}

// CSV出力
function exportCSV() {
  const data = currentPortfolio && portfolios[currentPortfolio]
    ? allData.filter(c => portfolios[currentPortfolio].codes.includes(c.code))
    : filteredData;

  const headers = ['証券コード','会社名','市場','業種','売上高','営業利益','純利益','時価総額','PER','PBR','ROE','ROA','営業利益率','NC比率','ネットネット','参考株価'];
  const rows = data.map(c => [
    c.code, c.name, c.market || '', c.industry_name || '',
    c.financials.sales || '',
    c.financials.operating_profit || '',
    c.financials.net_income || '',
    c.marketCap || '',
    c.per ? c.per.toFixed(1) : '',
    c.pbr ? c.pbr.toFixed(1) : '',
    c.roe ? c.roe.toFixed(1) : '',
    c.roa ? c.roa.toFixed(1) : '',
    c.operating_margin ? c.operating_margin.toFixed(1) : '',
    c.net_cash_ratio ? c.net_cash_ratio.toFixed(1) : '',
    c.net_net_ratio ? c.net_net_ratio.toFixed(2) : '',
    c.priceData ? c.priceData.price : ''
  ]);

  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jp-stock-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// フォーマット関数
function formatPeriod(periodEnd) {
  if (!periodEnd) return '不明';
  const parts = periodEnd.split('-');
  if (parts.length < 2) return periodEnd;
  return `${parts[0]}年${parseInt(parts[1], 10)}月期`;
}

function formatAmount(value) {
  if (value === null || value === undefined) return '不明';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return sign + (abs / 1_000_000_000_000).toFixed(1) + ' 兆円';
  if (abs >= 100_000_000) return sign + (abs / 100_000_000).toFixed(0) + ' 億円';
  if (abs >= 10_000) return sign + (abs / 10_000).toFixed(0) + ' 万円';
  return sign + abs.toLocaleString() + ' 円';
}

function formatShares(value) {
  if (!value) return '不明';
  if (value >= 100_000_000) return (value / 100_000_000).toFixed(1) + ' 億株';
  if (value >= 10_000) return (value / 10_000).toFixed(0) + ' 万株';
  return value.toLocaleString() + ' 株';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('SW登録成功'))
      .catch(err => console.log('SW登録失敗:', err));
  });
}
