import { cli, Strategy } from '@jackwener/opencli/registry';

// 8891 汽車 - 通用列表命令，支援常見篩選
// URL 範例：https://auto.8891.com.tw/?power[]=4&price=0_1500000&exsits=1&page=1
//
// 已知參數：
//   power[]=N       燃料類型（4=純電車；其餘值尚未窮舉）
//   price=min_max   價格範圍，單位 TWD（此 CLI 對外以「萬」計）
//   exsits=1        排除不在店（8891 官方拼字就是 exsits，非 exists）
//   page=N          頁碼，每頁 40 筆

cli({
  site: '8891',
  name: 'list',
  description: '8891 汽車 - 通用列表（支援燃料/價格/是否在店篩選）',
  domain: 'auto.8891.com.tw',
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'limit', type: 'int', default: 20, help: '結果筆數（每頁 40 筆自動翻頁）' },
    { name: 'page', type: 'int', default: 1, help: '起始頁碼（從 1 開始）' },
    { name: 'power', type: 'string', help: '燃料類型代碼，例：4=純電車（可多值以逗號分隔：4,3）' },
    { name: 'min-price', type: 'int', help: '最低價格（單位：萬）' },
    { name: 'max-price', type: 'int', help: '最高價格（單位：萬）' },
    { name: 'in-store-only', type: 'bool', default: false, help: '排除不在店車輛' },
  ],
  columns: ['rank', 'title', 'price', 'year', 'mileage', 'location', 'url'],
  func: async (page, kwargs) => {
    const startPage = Number(kwargs.page) || 1;
    const limit = Number(kwargs.limit) || 20;
    const pagesNeeded = Math.ceil(limit / 40);

    // --- 組 query string ---
    const params: string[] = [];

    if (kwargs.power) {
      const powers = String(kwargs.power).split(',').map((s) => s.trim()).filter(Boolean);
      for (const p of powers) params.push(`power[]=${encodeURIComponent(p)}`);
    }

    const minWan = kwargs['min-price'] != null ? Number(kwargs['min-price']) : null;
    const maxWan = kwargs['max-price'] != null ? Number(kwargs['max-price']) : null;
    if (minWan != null || maxWan != null) {
      const lo = minWan != null ? minWan * 10000 : 0;
      const hi = maxWan != null ? maxWan * 10000 : 99999999;
      params.push(`price=${lo}_${hi}`);
    }

    if (kwargs['in-store-only']) params.push('exsits=1');

    const baseQuery = params.join('&');
    const rows: any[] = [];

    for (let p = startPage; p < startPage + pagesNeeded; p++) {
      const url = `https://auto.8891.com.tw/?${baseQuery}${baseQuery ? '&' : ''}page=${p}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      const pageRows = await page.evaluate(`(() => {
        const cards = document.querySelectorAll('a.row-item');
        return Array.from(cards).map((card) => {
          const titleEl = card.querySelector('[class*="ib-it-text"]');
          const priceEl = card.querySelector('[class*="ib-price"] b');
          const icons = card.querySelectorAll('[class*="ib-icon"]');
          const infoItems = card.querySelectorAll('[class*="ib-ii-item"]');
          const href = card.getAttribute('href') || '';
          const idMatch = href.match(/usedauto-infos-(\\d+)/);
          const absUrl = href.startsWith('http')
            ? href
            : 'https://auto.8891.com.tw' + href;
          let priceText = null;
          if (priceEl && priceEl.textContent) {
            const t = priceEl.textContent.trim();
            priceText = /^[\\d.]+$/.test(t) ? t + '萬' : t;
          }
          return {
            id: idMatch ? idMatch[1] : null,
            title: (titleEl && titleEl.textContent ? titleEl.textContent.trim() : null),
            price: priceText,
            year: (icons[0] && icons[0].textContent ? icons[0].textContent.trim() : null),
            mileage: (icons[1] && icons[1].textContent ? icons[1].textContent.trim() : null),
            location: (infoItems[0] && infoItems[0].textContent ? infoItems[0].textContent.trim() : null),
            url: absUrl.split('?')[0],
          };
        });
      })()`);

      const listRows = Array.isArray(pageRows) ? (pageRows as any[]) : [];
      rows.push(...listRows);
      if (listRows.length === 0) break;
      if (rows.length >= limit) break;
    }

    return rows.slice(0, limit).map((item, i) => ({
      rank: i + 1,
      title: item.title || '',
      price: item.price || '',
      year: item.year || '',
      mileage: item.mileage || '',
      location: item.location || '',
      url: item.url || '',
    }));
  },
});
