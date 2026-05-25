fetch('./data/fundamentals.json')
  .then(res => res.json())
  .then(data => {
    // 更新日時を表示
    document.getElementById('updated-at').textContent =
      '更新日時：' + data.updated_at;

    const list = document.getElementById('company-list');
    list.innerHTML = '';

    data.companies.forEach(company => {
      const f = company.financials;

      const card = document.createElement('div');
      card.className = 'company-card';

      card.innerHTML = `
        <div class="company-name">${company.name}</div>
        <div class="company-code">証券コード：${company.code}</div>
        <div class="financials">
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

// 金額を「兆・億・万円」単位に変換
function formatAmount(value) {
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
  if (value >= 100_000_000) {
    return (value / 100_000_000).toFixed(1) + ' 億株';
  } else if (value >= 10_000) {
    return (value / 10_000).toFixed(0) + ' 万株';
  }
  return value.toLocaleString() + ' 株';
}