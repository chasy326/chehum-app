// 체험단 한눈에: reads public listing rows from Supabase (read-only publishable key, RLS select only).
const SUPABASE_URL = 'https://ztmsfnavjnamfkcfunsp.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_y-o0vcUexP6N_7xJX0Kyig_fa9d5m9f';
const PAGE_SIZE = 40;

const SOURCE_NAME = {
  pavlovu: '파블로',
  cometoplay: '놀러와체험단',
  dinnerqueen: '디너의여왕',
  revu: '레뷰',
  chvu: '체험뷰',
};
const TYPES = ['방문형', '배송형', '구매형', '기자단'];
const MEDIA = ['블로그', '인스타', '유튜브'];
const CATEGORIES = ['맛집', '뷰티', '숙박', '문화', '기타'];
const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'];
const SIDO_LONG = {
  서울특별시: '서울', 부산광역시: '부산', 대구광역시: '대구', 인천광역시: '인천', 광주광역시: '광주',
  대전광역시: '대전', 울산광역시: '울산', 세종특별자치시: '세종', 경기도: '경기', 강원특별자치도: '강원',
  강원도: '강원', 충청북도: '충북', 충청남도: '충남', 전라북도: '전북', 전북특별자치도: '전북',
  전라남도: '전남', 경상북도: '경북', 경상남도: '경남', 제주특별자치도: '제주',
};

const state = { rows: [], shown: PAGE_SIZE, today: kstToday() };

function kstToday() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// "서울 종로구", "경기도 김포시", "서울, 인천, 경기" -> "서울" / "경기". Unknown -> null.
function sidoOf(region) {
  if (!region) return null;
  const first = region.split(/[\s,]/)[0];
  if (SIDO_LONG[first]) return SIDO_LONG[first];
  return SIDO.find((s) => first.startsWith(s)) || null;
}

function enrich(r) {
  const diff = r.apply_end ? Math.round((Date.parse(r.apply_end) - Date.parse(state.today)) / 86400000) : null;
  return {
    ...r,
    sido: sidoOf(r.region),
    typeN: TYPES.includes(r.type) ? r.type : null,
    mediaN: MEDIA.includes(r.media) ? r.media : null,
    categoryN: CATEGORIES.includes(r.category) ? r.category : '기타',
    dday: diff,
  };
}

function ddayLabel(d) {
  if (d === null) return { text: '마감일 미정', cls: '' };
  if (d < 0) return { text: '마감', cls: '' };
  if (d === 0) return { text: '오늘 마감', cls: 'soon' };
  return { text: 'D-' + d, cls: d <= 2 ? 'soon' : '' };
}

function fillSelect(id, label, values, labelFn = (v) => v) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${esc(label)}</option>` +
    values.map((v) => `<option value="${esc(v)}">${esc(labelFn(v))}</option>`).join('');
}

function setupFilters() {
  const sidos = [...new Set(state.rows.map((r) => r.sido).filter(Boolean))].sort((a, b) => SIDO.indexOf(a) - SIDO.indexOf(b));
  fillSelect('sido', '전체 지역', sidos);
  fillSelect('type', '전체 유형', TYPES);
  fillSelect('media', '전체 매체', MEDIA);
  fillSelect('category', '전체 카테고리', CATEGORIES);
  const sources = [...new Set(state.rows.map((r) => r.source))];
  fillSelect('source', '전체 사이트', sources, (s) => SOURCE_NAME[s] || s);
}

function currentFilters() {
  return {
    q: document.getElementById('q').value.trim(),
    sido: document.getElementById('sido').value,
    type: document.getElementById('type').value,
    media: document.getElementById('media').value,
    category: document.getElementById('category').value,
    source: document.getElementById('source').value,
    sort: document.getElementById('sort').value,
    hideClosed: document.getElementById('hideClosed').checked,
  };
}

function matches(r, f) {
  if (f.hideClosed && r.dday !== null && r.dday < 0) return false;
  if (f.sido && r.sido !== f.sido) return false;
  if (f.type && r.typeN !== f.type) return false;
  if (f.media && r.mediaN !== f.media) return false;
  if (f.category && r.categoryN !== f.category) return false;
  if (f.source && r.source !== f.source) return false;
  if (f.q && !(`${r.title} ${r.region || ''}`).includes(f.q)) return false;
  return true;
}

function ratio(r) {
  return r.recruit_count ? (r.applicant_count || 0) / r.recruit_count : Number.POSITIVE_INFINITY;
}

function sortRows(list, sort) {
  const cmpNullLast = (a, b, key) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const copy = [...list];
  if (sort === 'deadline') copy.sort((a, b) => cmpNullLast(a, b, 'apply_end'));
  if (sort === 'new') copy.sort((a, b) => b.id - a.id);
  if (sort === 'recruit') copy.sort((a, b) => (b.recruit_count || 0) - (a.recruit_count || 0));
  if (sort === 'competition') copy.sort((a, b) => ratio(a) - ratio(b));
  return copy;
}

function card(r) {
  const dd = ddayLabel(r.dday);
  const src = SOURCE_NAME[r.source] || r.source;
  const place = r.region || '지역 미정';
  const meta = [place, r.typeN || '유형 미정', r.mediaN || '매체 미정'].join(' · ');
  const counts = `모집 ${r.recruit_count ?? '-'}명 · 신청 ${r.applicant_count ?? '-'}명`;
  return `
    <article class="card">
      <div class="card-top">
        <span class="src">${esc(src)}</span>
        <span class="dd ${dd.cls}">${esc(dd.text)}</span>
      </div>
      <h3>${esc(r.title)}</h3>
      <p class="meta">${esc(meta)}</p>
      ${r.reward ? `<p class="reward">${esc(r.reward)}</p>` : ''}
      <div class="foot-row">
        <span class="counts">${esc(counts)}</span>
        <a class="go" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">원본에서 보기</a>
      </div>
    </article>`;
}

function render(resetPaging) {
  if (resetPaging) state.shown = PAGE_SIZE;
  const f = currentFilters();
  const filtered = sortRows(state.rows.filter((r) => matches(r, f)), f.sort);
  const list = document.getElementById('list');
  const more = document.getElementById('more');
  document.getElementById('status').textContent = `조건에 맞는 공고 ${filtered.length}건`;
  document.getElementById('status').classList.remove('error');
  list.innerHTML = filtered.slice(0, state.shown).map(card).join('') ||
    '<p class="status">조건에 맞는 공고가 없어요. 필터를 바꿔 보세요.</p>';
  more.hidden = filtered.length <= state.shown;
}

async function load() {
  const status = document.getElementById('status');
  status.textContent = '공고를 불러오는 중이에요...';
  const url = `${SUPABASE_URL}/rest/v1/listings` +
    `?select=id,source,title,url,region,category,type,media,reward,recruit_count,applicant_count,apply_end` +
    `&or=(apply_end.gte.${state.today},apply_end.is.null)` +
    `&order=apply_end.asc.nullslast&limit=3000`;
  const res = await fetch(url, { headers: { apikey: PUBLISHABLE_KEY } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  state.rows = (await res.json()).map(enrich);
}

function bind() {
  ['q', 'sido', 'type', 'media', 'category', 'source', 'sort', 'hideClosed'].forEach((id) => {
    const el = document.getElementById(id);
    el.addEventListener(id === 'q' ? 'input' : 'change', () => render(true));
  });
  document.getElementById('more').addEventListener('click', () => {
    state.shown += PAGE_SIZE;
    render(false);
  });
}

(async function init() {
  bind();
  try {
    await load();
    setupFilters();
    render(true);
  } catch (e) {
    const status = document.getElementById('status');
    status.textContent = '공고를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요. (' + e.message + ')';
    status.classList.add('error');
  }
})();
