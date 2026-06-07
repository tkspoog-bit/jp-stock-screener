let allData = [];
let pricesData = {};
let currentSort = 'market_cap';
let currentLimit = 50;
let currentPage = 1;
let currentMarketFilter = null;
let currentIndustryFilter = '';

Promise.all([
  fetch('./data/fundamentals.json').then(r => r.json()),
  fetch('./data/prices.json').then(r => r.json())
])
.then(([fundamentals, prices]) => {
  pricesData = prices;
  document.getElementById('updated-at').textContent =
    '更新日時：' + fundamentals.updated_at;

  allData = fundamentals.companies.map(company => {
    const priceData = prices[company.code];
    const shares = company.financials.shares_issued;
    const marketCap = (priceData && shares) ? priceData.price * shares : null;
    const f = company.financials;
    const per = (marketCap && f.net_income) ? marketCap / f.net_income : null;
    const pbr = (marketCap && f.equity) ? marketCap / f.equity : null;
    const roe = (f.net_income && f.equity) ? f.net_income / f.equity * 100 : null;
    const roa = (f.net_income && f.total_assets) ? f.net_income / f.total_assets * 100 : null;
    const operating_margin = (f.operating_profit && f.sales) ? f.operating_profit / f.sales * 100 : null;
    const net_cash_ratio = (f.net_cash && marketCap) ? f.net_cash / marketCap * 100 : null;
      return { ...company, marketCap, priceData, per, pbr, roe, roa, operating_margin, net_cash_ratio };
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

  filterList();
})
.catch(err => {
  document.getElementById('company-list').textContent =
    'データの読み込みに失敗しました：' + err.message;
});

function filterList() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const perMax = parseFloat(document.getElementById('filter-per').value);
  const roeMin = parseFloat(document.getElementById('filter-roe').value);
  const marginMin = parseFloat(document.getElementById('filter-margin').value);
  const capMax = parseFloat(document.getElementById('filter-cap').value);

  let filtered = allData;
  if (query) {
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.code.toLowerCase().includes(query)
    );
  }
  if (currentMarketFilter) {
    filtered = filtered.filter(c => c.market === currentMarketFilter);
  }
  if (currentIndustryFilter) {
    filtered = filtered.filter(c => c.industry_name === currentIndustryFilter);
  }
  if (!isNaN(perMax)) {
    filtered = filtered.filter(c => c.per !== null && c.per <= perMax);
  }
  if (!isNaN(roeMin)) {
    filtered = filtered.filter(c => c.roe !== null && c.roe >= roeMin);
  }
  if (!isNaN(marginMin)) {
    filtered = filtered.filter(c => c.operating_margin !== null && c.operating_margin >= marginMin);
  }
  if (!isNaN(capMax)) {
    filtered = filtered.filter(c => c.marketCap !== null && c.marketCap <= capMax * 100000000);
  }
  const ncpMin = parseFloat(document.getElementById('filter-ncp').value);
  if (!isNaN(ncpMin)) {
    filtered = filtered.filter(c => c.net_cash_ratio !== null && c.net_cash_ratio >= ncpMin);
  }
  currentPage = 1;
  renderList(currentSort, filtered);
}

function clearScreenFilter() {
  document.getElementById('filter-per').value = '';
  document.getElementById('filter-roe').value = '';
  document.getElementById('filter-margin').value = '';
  document.getElementById('filter-cap').value = '';
  document.getElementById('filter-ncp').value = '';
  filterList();
}

function setFilter(type, value, btn) {
  currentMarketFilter = value;
  document.querySelectorAll('#filter-bar button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterList();
}

function setIndustryFilter(value) {
  currentIndustryFilter = value;
  filterList();
}

function changePage(dir) {
  currentPage += dir;
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const filtered = query
    ? allData.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.code.toLowerCase().includes(query)
      )
    : allData;
  renderList(currentSort, filtered);
}

function setLimit(n, btn) {
  currentLimit = n;
  currentPage = 1;
  document.querySelectorAll('#limit-bar button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterList();
}

function sortBy(key, btn) {
  currentSort = key;
  document.querySelectorAll('#sort-bar button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterList();
}

function renderList(sortKey, data = allData) {
  const sorted = [...data].sort((a, b) => {
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

  const total = sorted.length;
  const totalPages = currentLimit ? Math.ceil(total / currentLimit) : 1;
  const safeLimit = currentLimit || total;
  
  const paginated = sorted.slice((currentPage - 1) * safeLimit, currentPage * safeLimit);

  // ページネーション（上）
  const navTop = document.createElement('div');
  navTop.className = 'pagination';
  navTop.innerHTML = `
    <button onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>◀ 前へ</button>
    <span>${currentPage} / ${totalPages} ページ（全${total}件）</span>
    <button onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>次へ ▶</button>
  `;
  list.appendChild(navTop);

  paginated.forEach(company => {
    const f = company.financials;
    const filing = company.latest_filing || {};
    const periodLabel = formatPeriod(filing.period_end);
    const card = document.createElement('div');
    card.className = 'company-card';
    card.innerHTML = `
      <div class="company-name">${company.name}</div>
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
        ${f.investing_cf !== undefined ? `
        <div class="financial-row">
          <span class="financial-label">投資CF</span>
          <span class="financial-value">${formatAmount(f.investing_cf)}</span>
        </div>` : ''}
        ${f.dividend_per_share !== undefined ? `
        <div class="financial-row">
          <span class="financial-label">1株配当</span>
          <span class="financial-value">${f.dividend_per_share} 円</span>
        </div>` : ''}
        <div class="metrics-grid">
          ${company.per !== null ? `
          <div class="metric-item">
            <span class="metric-label">PER</span>
            <span class="metric-value">${company.per.toFixed(1)} 倍</span>
          </div>` : ''}
          ${company.pbr !== null ? `
          <div class="metric-item">
            <span class="metric-label">PBR</span>
            <span class="metric-value">${company.pbr.toFixed(1)} 倍</span>
          </div>` : ''}
          ${company.roe !== null ? `
          <div class="metric-item">
            <span class="metric-label">ROE</span>
            <span class="metric-value">${company.roe.toFixed(1)} %</span>
          </div>` : ''}
          ${company.roa !== null ? `
          <div class="metric-item">
            <span class="metric-label">ROA</span>
            <span class="metric-value">${company.roa.toFixed(1)} %</span>
          </div>` : ''}
          ${company.operating_margin !== null ? `
            <div class="metric-item">
              <span class="metric-label">営業利益率</span>
              <span class="metric-value">${company.operating_margin.toFixed(1)} %</span>
            </div>` : ''}
            ${company.net_cash_ratio !== null ? `
            <div class="metric-item">
              <span class="metric-label">NC比率</span>
              <span class="metric-value">${company.net_cash_ratio.toFixed(1)} %</span>
            </div>` : ''}
        </div>
        <div class="financial-row">
          <span class="financial-label">参考株価</span>
          <span class="financial-value">${company.priceData ? company.priceData.price.toLocaleString() + ' 円（' + company.priceData.date + '）' : '不明'}</span>
        </div>
        <div class="financial-row">
          <span class="financial-label">発行済株式数</span>
          <span class="financial-value">${formatShares(f.shares_issued)}</span>
        </div>
      </div>
    `;
    list.appendChild(card);
  });

  // ページネーション（下）
  const navBottom = document.createElement('div');
  navBottom.className = 'pagination';
  navBottom.innerHTML = navTop.innerHTML;
  list.appendChild(navBottom);
}

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