import { cli, Strategy } from '@jackwener/opencli/registry';
// 8891 汽車 - 篩選條件：其他 → 燃料 → 純電車
// URL 模式：https://auto.8891.com.tw/?power[]=4&page=N
// power=4 對應「純電車」；每頁 40 筆；SSR HTML，無需登入
cli({
    site: '8891',
    name: 'electric',
    description: '8891 汽車 - 純電車列表（燃料篩選：純電）',
    domain: 'auto.8891.com.tw',
    strategy: Strategy.COOKIE,
    browser: true,
    args: [
        { name: 'limit', type: 'int', default: 20, help: '結果筆數（每頁 40 筆，會自動翻頁）' },
        { name: 'page', type: 'int', default: 1, help: '起始頁碼（從 1 開始）' },
    ],
    columns: ['rank', 'title', 'price', 'year', 'mileage', 'location', 'url'],
    func: async (page, kwargs) => {
        const startPage = Number(kwargs.page) || 1;
        const limit = Number(kwargs.limit) || 20;
        const pagesNeeded = Math.ceil(limit / 40);
        const rows = [];
        for (let p = startPage; p < startPage + pagesNeeded; p++) {
            const url = `https://auto.8891.com.tw/?power[]=4&page=${p}`;
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
          return {
            id: idMatch ? idMatch[1] : null,
            title: (titleEl && titleEl.textContent ? titleEl.textContent.trim() : null),
            price: (() => {
              if (!priceEl || !priceEl.textContent) return null;
              const t = priceEl.textContent.trim();
              return /^[\\d.]+$/.test(t) ? t + '萬' : t;
            })(),
            year: (icons[0] && icons[0].textContent ? icons[0].textContent.trim() : null),
            mileage: (icons[1] && icons[1].textContent ? icons[1].textContent.trim() : null),
            location: (infoItems[0] && infoItems[0].textContent ? infoItems[0].textContent.trim() : null),
            url: absUrl.split('?')[0],
          };
        });
      })()`);
            const list = Array.isArray(pageRows) ? pageRows : [];
            rows.push(...list);
            if (list.length === 0)
                break; // 沒有更多資料就停
            if (rows.length >= limit)
                break;
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
