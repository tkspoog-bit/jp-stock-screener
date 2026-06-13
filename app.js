let allData = [];
let pricesData = {};
let currentSort = 'market_cap';
let currentMarketFilters = [];
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
    const dividend_yield = (f.dividend_per_share && priceData) ? f.dividend_per_share / priceData.price * 100 : null;
    const equity_ratio = f.equity_ratio || null;
    return { ...company, marketCap, priceData, per, pbr, roe, roa, operating_margin, net_cash_ratio, net_net_ratio, dividend_yield, equity_ratio };
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

const HINTS = {
  'PER': '株価収益率。株価が1株あたり利益の何倍かを示す。低いほど割安。',
  'PBR': '株価純資産倍率。株価が1株あたり純資産の何倍かを示す。1倍割れは解散価値以下。',
  'ROE': '自己資本利益率。純資産に対してどれだけ利益を稼いだか。高いほど効率的。',
  'ROA': '総資産利益率。総資産に対してどれだけ利益を稼いだか。',
  '営業利益率': '売上に対する営業利益の割合。本業の稼ぐ力を示す。',
  'NC比率': 'ネットキャッシュ比率。（現金×0.7−有利子負債）÷時価総額。高いほどキャッシュリッチ。清原達郎氏が重視する指標。',
  'ネットネット': 'ネットネット倍率。（流動資産−総負債）÷時価総額。1倍以上は流動資産だけで時価総額を上回る超割安株。',
  '時価総額': '株価×発行済株式数。会社全体の値段。',
  '営業CF': '営業活動によるキャッシュフロー。本業で現金をどれだけ稼いだか。',
  '投資CF': '投資活動によるキャッシュフロー。設備投資などへの支出。マイナスが多いほど積極投資。',
  '配当利回り': '1株配当÷株価×100。株を持っているだけでもらえる配当金の割合。高いほど株主還元が厚い。',
  '自己資本比率': '総資産に対する純資産の割合。高いほど財務が安全。40%以上が目安。借金に頼らず自力で稼いでいる会社の証拠。',
  'タグ：大型株': '時価総額1兆円以上',
  'タグ：中型株': '時価総額1000億円以上1兆円未満',
  'タグ：小型株': '時価総額1000億円未満',
  'タグ：高ROE': 'ROE 20%以上。自己資本を効率よく使って稼いでいる会社。',
  'タグ：高利益率': '営業利益率 20%以上。本業で高い利益を上げている会社。',
  'タグ：低PER': 'PER 10倍以下。株価が利益に対して割安な状態。',
  'タグ：低PBR': 'PBR 1倍以下。株価が純資産を下回る解散価値以下の状態。',
  'タグ：キャッシュリッチ': 'NC比率 30%以上。現金×0.7が有利子負債を大きく上回る会社。清原達郎氏が重視。',
  'タグ：ネットネット株': 'ネットネット倍率 1倍以上。流動資産だけで時価総額を上回る超割安株。',
  'タグ：高CF': '営業CFが純利益を上回る。実際の現金創出力が高い会社。',
  'タグ：高配当': '配当利回り3%以上。株を持っているだけで多くの配当金がもらえる会社。',
};

function initSettings() {
  const saved = localStorage.getItem('show-hints');
  const showHints = saved === null ? true : saved === 'true';
  document.getElementById('show-hints').checked = showHints;

  const apiKey = localStorage.getItem('gemini-api-key');
  if (apiKey) {
    document.getElementById('gemini-api-key').value = apiKey;
    document.getElementById('api-key-status').textContent = '✓ APIキー設定済み';
  }
  const model = localStorage.getItem('gemini-model');
  if (model) {
    document.getElementById('gemini-model').value = model;
  }
}

function saveApiKey() {
  const key = document.getElementById('gemini-api-key').value.trim();
  if (!key) {
    document.getElementById('api-key-status').textContent = 'キーを入力してください';
    return;
  }
  localStorage.setItem('gemini-api-key', key);
  document.getElementById('api-key-status').textContent = '✓ 保存しました';
}

function saveModel() {
  const model = document.getElementById('gemini-model').value;
  localStorage.setItem('gemini-model', model);
}

function getModel() {
  return localStorage.getItem('gemini-model') || 'gemini-3.1-flash-lite';
}

function getApiKey() {
  return localStorage.getItem('gemini-api-key') || '';
}

const TAG_COLORS = {
  'タグ：大型株': '#1a1a2e',
  'タグ：中型株': '#2d6a9f',
  'タグ：小型株': '#5a8a6a',
  'タグ：高ROE': '#e07b3a',
  'タグ：高利益率': '#e07b3a',
  'タグ：低PER': '#9b59b6',
  'タグ：低PBR': '#9b59b6',
  'タグ：キャッシュリッチ': '#27ae60',
  'タグ：ネットネット株': '#c0392b',
  'タグ：高CF': '#2980b9',
  'タグ：高配当': '#d4a017',
};

function initGlossary() {
  const list = document.getElementById('glossary-list');
  list.innerHTML = '';
  Object.entries(HINTS).forEach(([key, desc]) => {
    const item = document.createElement('div');
    item.className = 'hint-item';
    const color = TAG_COLORS[key];
    const label = color
      ? `<span class="company-tag" style="background:${color}">${key.replace('タグ：', '')}</span>`
      : `<div class="hint-label">${key}</div>`;
    item.innerHTML = `
      ${label}
      <div class="hint-desc" style="margin-top:6px">${desc}</div>
    `;
    list.appendChild(item);
  });
}

function openDetail(code) {
  const company = allData.find(c => c.code === code);
  if (!company) return;

  switchTab('detail');

  const content = document.getElementById('detail-content');
  const f = company.financials;
  const history = company.history || [];

  // 年ラベル生成
  const periodLabels = {
    'Prior4YearDuration': '-4期',
    'Prior3YearDuration': '-3期',
    'Prior2YearDuration': '-2期',
    'Prior1YearDuration': '-1期',
    'CurrentYearDuration': '今期'
  };

  const historyWithLabel = history.map(h => ({
    ...h,
    label: periodLabels[h.period] || h.period
  }));

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-name">${company.name}</div>
      <div class="detail-code">${company.code}　${company.market || ''}　${company.industry_name || ''}</div>
      ${company.description ? `<div class="company-desc">${company.description}</div>` : ''}
      <div class="company-tags">${generateTags(company)}</div>
    </div>

    <div class="detail-section">
      <h3>🤖 AI詳細サマリ</h3>
      <div class="detail-ai-notice">※ 銘柄を開くたびにAIが再生成します。APIキーの利用枠を消費します。</div>
      <div id="ai-summary" class="detail-ai-loading">分析中...</div>
    </div>

    <div class="detail-section">
      <h3>📈 売上・利益推移</h3>
      <div class="chart-container">
        <canvas id="chart-revenue"></canvas>
      </div>
    </div>

    <div class="detail-section">
      <h3>📊 EPS推移</h3>
      <div class="chart-container">
        <canvas id="chart-eps"></canvas>
      </div>
    </div>

    <div class="detail-section">
      <h3>💰 主要指標</h3>
      <div class="metrics-grid">
        ${company.per !== null ? `<div class="metric-item"><span class="metric-label">PER</span><span class="metric-value">${company.per.toFixed(1)} 倍</span></div>` : ''}
        ${company.pbr !== null ? `<div class="metric-item"><span class="metric-label">PBR</span><span class="metric-value">${company.pbr.toFixed(1)} 倍</span></div>` : ''}
        ${company.roe !== null ? `<div class="metric-item"><span class="metric-label">ROE</span><span class="metric-value">${company.roe.toFixed(1)} %</span></div>` : ''}
        ${company.roa !== null ? `<div class="metric-item"><span class="metric-label">ROA</span><span class="metric-value">${company.roa.toFixed(1)} %</span></div>` : ''}
        ${company.operating_margin !== null ? `<div class="metric-item"><span class="metric-label">営業利益率</span><span class="metric-value">${company.operating_margin.toFixed(1)} %</span></div>` : ''}
        ${company.net_cash_ratio !== null ? `<div class="metric-item"><span class="metric-label">NC比率</span><span class="metric-value">${company.net_cash_ratio.toFixed(1)} %</span></div>` : ''}
        ${company.net_net_ratio !== null ? `<div class="metric-item"><span class="metric-label">ネットネット</span><span class="metric-value">${company.net_net_ratio.toFixed(2)} 倍</span></div>` : ''}
        ${company.dividend_yield !== null ? `<div class="metric-item"><span class="metric-label">配当利回り</span><span class="metric-value">${company.dividend_yield.toFixed(2)} %</span></div>` : ''}
      </div>
    </div>
  `;

  // グラフ描画
  drawRevenueChart(historyWithLabel);
  drawEpsChart(historyWithLabel);

  // AI詳細サマリ生成
  generateAISummary(company);
}

function closeDetail() {
  switchTab('result');
}

function drawRevenueChart(history) {
  const canvas = document.getElementById('chart-revenue');
  if (!canvas || history.length === 0) return;
  const ctx = canvas.getContext('2d');

  const labels = history.map(h => h.label);
  const sales = history.map(h => h.net_sales ? h.net_sales / 100000000 : null);
  const opIncome = history.map(h => h.operating_income ? h.operating_income / 100000000 : null);
  const netIncome = history.map(h => h.net_profit ? h.net_profit / 100000000 : null);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '営業利益(億円)',
          data: opIncome,
          backgroundColor: 'rgba(230,126,34,0.7)',
          yAxisID: 'y2'
        },
        {
          label: '純利益(億円)',
          data: netIncome,
          backgroundColor: 'rgba(39,174,96,0.7)',
          yAxisID: 'y2'
        },
        {
          label: '売上高(億円)',
          data: sales,
          type: 'line',
          borderColor: '#1a1a2e',
          backgroundColor: 'rgba(26,26,46,0.1)',
          tension: 0.3,
          yAxisID: 'y1',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' } },
      scales: {
        y1: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '売上高(億円)' }
        },
        y2: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '利益(億円)' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function drawEpsChart(history) {
  const canvas = document.getElementById('chart-eps');
  if (!canvas || history.length === 0) return;
  const ctx = canvas.getContext('2d');

  const labels = history.map(h => h.label);
  const eps = history.map(h =>
    (h.net_profit && h.shares_outstanding) ? (h.net_profit / h.shares_outstanding).toFixed(1) : null
  );

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'EPS(円)',
        data: eps,
        borderColor: '#1a1a2e',
        backgroundColor: 'rgba(26,26,46,0.1)',
        tension: 0.3,
        fill: true
      }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

async function generateAISummary(company) {
  const f = company.financials;
  const history = company.history || [];

  const prompt = `
以下の企業データを分析して、個人投資家向けに200文字程度で投資判断のポイントを説明してください。
企業名：${company.name}
業種：${company.industry_name}
売上高：${f.sales ? Math.round(f.sales/100000000) + '億円' : '不明'}
営業利益：${f.operating_profit ? Math.round(f.operating_profit/100000000) + '億円' : '不明'}
ROE：${company.roe ? company.roe.toFixed(1) + '%' : '不明'}
営業利益率：${company.operating_margin ? company.operating_margin.toFixed(1) + '%' : '不明'}
PER：${company.per ? company.per.toFixed(1) + '倍' : '不明'}
NC比率：${company.net_cash_ratio ? company.net_cash_ratio.toFixed(1) + '%' : '不明'}
ネットネット倍率：${company.net_net_ratio ? company.net_net_ratio.toFixed(2) + '倍' : '不明'}
  `.trim();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${getApiKey()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    document.getElementById('ai-summary').textContent = text;
    document.getElementById('ai-summary').className = 'detail-ai-text';
  } catch (e) {
    document.getElementById('ai-summary').textContent = 'AI分析を取得できませんでした。';
  }
}

function saveSettings() {
  const showHints = document.getElementById('show-hints').checked;
  localStorage.setItem('show-hints', showHints);
}

function showHint(key) {
  const showHints = document.getElementById('show-hints').checked;
  if (!showHints) return;
  const desc = HINTS[key];
  if (!desc) return;
  alert(`${key}\n\n${desc}`);
}



// タブ切り替え
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${tab}-screen`).classList.add('active');
  const navBtn = document.getElementById(`nav-${tab}`);
  if (navBtn) navBtn.classList.add('active');
  if (tab === 'result') renderList();
  if (tab === 'portfolio') renderPortfolioScreen();
  if (tab === 'settings') initSettings();
  if (tab === 'glossary') initGlossary();
  if (tab === 'detail') {}
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
  const yieldMin = parseFloat(document.getElementById('filter-yield').value);
  const equityRatioMin = parseFloat(document.getElementById('filter-equity-ratio').value);
  const cfFilter = document.getElementById('filter-cf').value;

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
  if (!isNaN(equityRatioMin)) {
    if (equityRatioMin >= 80) filtered = filtered.filter(c => c.equity_ratio !== null && c.equity_ratio >= equityRatioMin);
    else if (equityRatioMin <= 30) filtered = filtered.filter(c => c.equity_ratio !== null && c.equity_ratio <= equityRatioMin);
    else filtered = filtered.filter(c => c.equity_ratio !== null && c.equity_ratio >= equityRatioMin);
  }
  if (cfFilter === '1') {
    filtered = filtered.filter(c => c.financials.operating_cf && c.financials.operating_cf > 0);
  }
  if (!isNaN(yieldMin)) {
    if (yieldMin <= 1) filtered = filtered.filter(c => c.dividend_yield !== null && c.dividend_yield <= yieldMin);
    else filtered = filtered.filter(c => c.dividend_yield !== null && c.dividend_yield >= yieldMin);
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
  document.getElementById('filter-yield').value = '';
  document.getElementById('filter-equity-ratio').value = '';
  document.getElementById('filter-cf').value = '';
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

  const displayData = currentSort === 'dividend_yield'
    ? data.filter(c => c.dividend_yield !== null)
    : data;
  const sorted = [...displayData].sort((a, b) => {
    let valA, valB;
    if (['per','pbr','roe','roa','operating_margin','net_cash_ratio','net_net_ratio','dividend_yield'].includes(currentSort)) {
      valA = a[currentSort] !== null ? a[currentSort] : -Infinity;
      valB = b[currentSort] !== null ? b[currentSort] : -Infinity;
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
    card.style.cursor = 'pointer';
    card.onclick = (e) => {
      if (e.target.classList.contains('pf-btn') || e.target.classList.contains('company-tag')) return;
      openDetail(company.code);
    };
    card.innerHTML = `
      <div class="company-header">
        <div class="company-name">${company.name}</div>
        <button class="pf-btn ${inPf ? 'in-pf' : ''}" onclick="togglePortfolio('${company.code}')">${inPf ? '★' : '☆'}</button>
      </div>
      <div class="company-code">証券コード：${company.code}${company.market ? `　${company.market}` : ''}${company.industry_name ? `　${company.industry_name}` : ''}</div>
      <div class="company-tags">${generateTags(company)}</div>
      ${company.description ? `<div class="company-desc">${company.description}</div>` : ''}
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
          ${company.per !== null ? `<div class="metric-item" onclick="showHint('PER')"><span class="metric-label">PER ？</span><span class="metric-value">${company.per.toFixed(1)} 倍</span></div>` : ''}
          ${company.pbr !== null ? `<div class="metric-item" onclick="showHint('PBR')"><span class="metric-label">PBR ？</span><span class="metric-value">${company.pbr.toFixed(1)} 倍</span></div>` : ''}
          ${company.roe !== null ? `<div class="metric-item" onclick="showHint('ROE')"><span class="metric-label">ROE ？</span><span class="metric-value">${company.roe.toFixed(1)} %</span></div>` : ''}
          ${company.roa !== null ? `<div class="metric-item" onclick="showHint('ROA')"><span class="metric-label">ROA ？</span><span class="metric-value">${company.roa.toFixed(1)} %</span></div>` : ''}
          ${company.operating_margin !== null ? `<div class="metric-item" onclick="showHint('営業利益率')"><span class="metric-label">営業利益率 ？</span><span class="metric-value">${company.operating_margin.toFixed(1)} %</span></div>` : ''}
          ${company.net_cash_ratio !== null ? `<div class="metric-item" onclick="showHint('NC比率')"><span class="metric-label">NC比率 ？</span><span class="metric-value">${company.net_cash_ratio.toFixed(1)} %</span></div>` : ''}
          ${company.net_net_ratio !== null ? `<div class="metric-item" onclick="showHint('ネットネット')"><span class="metric-label">ネットネット ？</span><span class="metric-value">${company.net_net_ratio.toFixed(2)} 倍</span></div>` : ''}
          ${company.dividend_yield !== null ? `<div class="metric-item" onclick="showHint('配当利回り')"><span class="metric-label">配当利回り ？</span><span class="metric-value">${company.dividend_yield.toFixed(2)} %</span></div>` : ''}
          ${company.equity_ratio !== null ? `<div class="metric-item" onclick="showHint('自己資本比率')"><span class="metric-label">自己資本比率 ？</span><span class="metric-value">${company.equity_ratio.toFixed(1)} %</span></div>` : ''}
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
function generateTags(c) {
  const tags = [];
  const f = c.financials;

  // 規模
  if (c.marketCap >= 1_000_000_000_000) tags.push({ label: '大型株', color: '#1a1a2e' });
  else if (c.marketCap >= 100_000_000_000) tags.push({ label: '中型株', color: '#2d6a9f' });
  else if (c.marketCap) tags.push({ label: '小型株', color: '#5a8a6a' });

  // 収益性
  if (c.roe >= 20) tags.push({ label: '高ROE', color: '#e07b3a' });
  if (c.operating_margin >= 20) tags.push({ label: '高利益率', color: '#e07b3a' });

  // 割安
  if (c.per && c.per <= 10) tags.push({ label: '低PER', color: '#9b59b6' });
  if (c.pbr && c.pbr <= 1) tags.push({ label: '低PBR', color: '#9b59b6' });
  if (c.net_cash_ratio >= 30) tags.push({ label: 'キャッシュリッチ', color: '#27ae60' });
  if (c.net_net_ratio >= 1) tags.push({ label: 'ネットネット株', color: '#c0392b' });

  // CF
  if (f.operating_cf && f.net_income && f.operating_cf > f.net_income) {
    tags.push({ label: '高CF', color: '#2980b9' });
  }

  if (c.dividend_yield >= 3) tags.push({ label: '高配当', color: '#d4a017' });
  if (tags.length === 0) return '';
  return tags.map(t =>
    `<span class="company-tag" style="background:${t.color}" onclick="showHint('タグ：${t.label}')">${t.label}</span>`
  ).join('');
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
