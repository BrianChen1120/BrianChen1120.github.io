/* =========================================================
   NTU GICE Communication Group · main script
   ========================================================= */

// ----------- 教授資料（順序依原網頁） -----------
// 資料來源：https://gice.ntu.edu.tw/Professor_mygice.php?group=CSP (2026-05-05)
const FACULTY = [
  {
    nameZh: "陳宏銘", nameEn: "Homer H. Chen",
    title: "教授", titleEn: "Professor",
    email: "homer@ntu.edu.tw",
    research:   "多媒體信號處理、計算攝影及顯示技術、音樂資訊探勘",
    researchEn: "Multimedia Signal Processing, Computational Photography and Display Technology, Music Information Retrieval",
    office:   "博理館 423 室",       officeEn: "Barry Lam Hall, Rm. 423",
    lab:      "電機二館 533 室",     labLocEn: "EE Building No. 2, Rm. 533",
    photo: "images/homer.jpg",
    labUrl: "http://mpac.ee.ntu.edu.tw/", homepage: ""
  },
  {
    nameZh: "鐘嘉德", nameEn: "Char-Dir Chung",
    title: "教授", titleEn: "Professor",
    email: "cdchung@ntu.edu.tw",
    research:   "通訊系統及理論、無線通訊、展頻通訊",
    researchEn: "Communication Systems and Theory, Wireless Communications, Spread-Spectrum Communications",
    office:   "博理館 426 室",       officeEn: "Barry Lam Hall, Rm. 426",
    lab:      "博理館 518 室",       labLocEn: "Barry Lam Hall, Rm. 518",
    photo: "images/cdchung.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "馮世邁", nameEn: "See-May Phoong",
    title: "教授", titleEn: "Professor",
    email: "smphoong@ntu.edu.tw",
    research:   "同步與估測、多載波通信系統、通信之訊號處理",
    researchEn: "Synchronization and Estimation, Multi-carrier Communication Systems, Signal Processing for Communications",
    office:   "博理館 420 室",       officeEn: "Barry Lam Hall, Rm. 420",
    lab:      "博理館 506 室",       labLocEn: "Barry Lam Hall, Rm. 506",
    photo: "images/smphoong.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "蘇炫榮", nameEn: "Hsuan-Jung Su",
    title: "教授", titleEn: "Professor",
    email: "hjs@ntu.edu.tw",
    research:   "編碼、調變、訊號處理",
    researchEn: "Coding, Modulation, Signal Processing",
    office:   "博理館 512 室",       officeEn: "Barry Lam Hall, Rm. 512",
    lab:      "電機二館 532 室",     labLocEn: "EE Building No. 2, Rm. 532",
    photo: "images/hjs.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "謝宏昀", nameEn: "Hung-Yun Hsieh",
    title: "教授", titleEn: "Professor",
    email: "hungyun@ntu.edu.tw",
    research:   "物聯網、車載通訊網路、網路科學與資訊安全",
    researchEn: "Internet of Things, Vehicular Communication Networks, Network Science and Information Security",
    office:   "電機二館 546 室",     officeEn: "EE Building No. 2, Rm. 546",
    lab:      "博理館 521 室",       labLocEn: "Barry Lam Hall, Rm. 521",
    photo: "images/hungyun.jpg",
    labUrl: "http://tonic.ee.ntu.edu.tw", homepage: ""
  },
  {
    nameZh: "葉丙成", nameEn: "Ping-Cheng Yeh",
    title: "教授", titleEn: "Professor",
    email: "pcyeh@ntu.edu.tw",
    research:   "無線通訊、無線網路",
    researchEn: "Wireless Communications, Wireless Networks",
    office:   "電機二館 248 室",     officeEn: "EE Building No. 2, Rm. 248",
    lab:      "博理館 515 室",       labLocEn: "Barry Lam Hall, Rm. 515",
    photo: "images/pcyeh.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "丁建均", nameEn: "Jian-Jiun Ding",
    title: "教授", titleEn: "Professor",
    email: "jjding@ntu.edu.tw",
    research:   "數位信號處理、數位影像處理",
    researchEn: "Digital Signal Processing, Digital Image Processing",
    office:   "明達館 723 室",       officeEn: "Ming-Da Building, Rm. 723",
    lab:      "明達館 531 室",       labLocEn: "Ming-Da Building, Rm. 531",
    photo: "images/jjding.jpg",
    labUrl: "https://disp.ee.ntu.edu.tw/", homepage: "https://djj.ee.ntu.edu.tw/"
  },
  {
    nameZh: "王奕翔", nameEn: "I-Hsiang Wang",
    title: "教授", titleEn: "Professor",
    email: "ihwang@ntu.edu.tw",
    research:   "消息理論、無線通訊、網路資訊與資料處理",
    researchEn: "Information Theory, Wireless Communications, Network Information and Data Processing",
    office:   "明達館 524 室",       officeEn: "Ming-Da Building, Rm. 524",
    lab:      "學新館 515 室",       labLocEn: "學新館 515 室",
    photo: "images/ihwang.jpg",
    labUrl: "http://cc.ee.ntu.edu.tw/~ihsiangw/NICLab/NIC.html", homepage: ""
  },
  {
    nameZh: "林士駿", nameEn: "Shih-Chun Lin",
    title: "教授", titleEn: "Professor",
    email: "sclinntu@ntu.edu.tw",
    research:   "消息理論、編碼、人工智慧物聯網資安",
    researchEn: "Information Theory, Coding, AIoT Security",
    office:   "電機二館 447 室",     officeEn: "EE Building No. 2, Rm. 447",
    lab:      "博理館 524 室",       labLocEn: "Barry Lam Hall, Rm. 524",
    photo: "images/sclinntu.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "周俊廷", nameEn: "Chun-Ting Chou",
    title: "副教授", titleEn: "Associate Professor",
    email: "chuntingchou@ntu.edu.tw",
    research:   "無線網路通訊協定、超高速個人無線區域網路、認知型智慧無線網路",
    researchEn: "Wireless Network Communication Protocols, Ultra-High-Speed Personal Wireless LAN, Cognitive Intelligent Wireless Networks",
    office:   "明達館 618 室",       officeEn: "Ming-Da Building, Rm. 618",
    lab:      "電機二館 550 室",     labLocEn: "EE Building No. 2, Rm. 550",
    photo: "images/chuntingchou.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "蘇柏青", nameEn: "Borching Su",
    title: "副教授", titleEn: "Associate Professor",
    email: "borching@ntu.edu.tw",
    research:   "通訊系統之信號處理",
    researchEn: "Signal Processing for Communication Systems",
    office:   "明達館 516 室",       officeEn: "Ming-Da Building, Rm. 516",
    lab:      "明達館 530 室",       labLocEn: "Ming-Da Building, Rm. 530",
    photo: "images/borching.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "劉俊麟", nameEn: "Chun-Lin Liu",
    title: "副教授", titleEn: "Associate Professor",
    email: "chunlinliu@ntu.edu.tw",
    research:   "稀疏陣列、陣列訊號處理、數位訊號處理、統計訊號處理",
    researchEn: "Sparse Arrays, Array Signal Processing, Digital Signal Processing, Statistical Signal Processing",
    office:   "明達館 515 室",       officeEn: "Ming-Da Building, Rm. 515",
    lab:      "電機二館 530 室",     labLocEn: "EE Building No. 2, Rm. 530",
    photo: "images/chunlinliu.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "鄭皓中", nameEn: "Hao-Chung Cheng",
    title: "副教授", titleEn: "Associate Professor",
    email: "haochung@ntu.edu.tw",
    research:   "量子資訊處理、量子通訊、量子機器學習",
    researchEn: "Quantum Information Processing, Quantum Communications, Quantum Machine Learning",
    office:   "電機二館 549 室",     officeEn: "EE Building No. 2, Rm. 549",
    lab:      "學新館 513 室",       labLocEn: "學新館 513 室",
    photo: "images/haochung.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "葉佳宜", nameEn: "Chia-Yi Yeh",
    title: "助理教授", titleEn: "Assistant Professor",
    email: "ycyyeh@ntu.edu.tw",
    research:   "無線通訊網路、毫米波、太赫茲、大規模天線陣列、無線通訊安全議題、無線感測",
    researchEn: "Wireless Communication Networks, Millimeter Wave, Terahertz, Large-Scale Antenna Arrays, Wireless Communication Security, Wireless Sensing",
    office:   "電機二館 335 室",     officeEn: "EE Building No. 2, Rm. 335",
    lab:      "電機二館 554 室",     labLocEn: "EE Building No. 2, Rm. 554",
    photo: "images/ycyyeh.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "黃楚翔", nameEn: "Chu-Hsiang Huang",
    title: "助理教授", titleEn: "Assistant Professor",
    email: "chuhsianh@ntu.edu.tw",
    research:   "新世代無線通訊系統設計、通訊系統標準化、人工智慧與機器學習、統計通信理論",
    researchEn: "Next-Generation Wireless Communication System Design, Communication System Standardization, Artificial Intelligence and Machine Learning, Statistical Communication Theory",
    office:   "電機二館 536 室",     officeEn: "EE Building No. 2, Rm. 536",
    lab:      "博理館 504 室",       labLocEn: "Barry Lam Hall, Rm. 504",
    photo: "images/chuhsianh.jpg",
    labUrl: "", homepage: ""
  },
  {
    nameZh: "王新博", nameEn: "Hsin-Po Wang",
    title: "助理教授", titleEn: "Assistant Professor",
    email: "hsinpo@ntu.edu.tw",
    research:   "編碼學、夏農理論、極化碼",
    researchEn: "Coding Theory, Shannon Theory, Polar Codes",
    office:   "電機二館 237 室",     officeEn: "EE Building No. 2, Rm. 237",
    lab:      "博理館 508 室",       labLocEn: "Barry Lam Hall, Rm. 508",
    photo: "images/hsinpo.jpg",
    labUrl: "", homepage: ""
  }
];

// ---------- SVG icons ----------
const ICON = {
  office: '<svg class="faculty-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/></svg>',
  lab: '<svg class="faculty-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v5l4 9a2 2 0 0 1-1.8 3H6.8A2 2 0 0 1 5 17l4-9V3z"/><path d="M8 14h8"/></svg>',
  mail: '<svg class="faculty-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  arrow: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  globe: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  flask: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6v5l4 9a2 2 0 0 1-1.8 3H6.8A2 2 0 0 1 5 17l4-9V3z"/><path d="M8 14h8"/></svg>'
};

// ---------- 當前語言 ----------
let currentLang = "zh"; // "zh" | "en"

// ---------- Render faculty cards ----------
function renderFaculty() {
  const grid = document.getElementById("facultyGrid");
  if (!grid) return;
  const en = currentLang === "en";

  const labelLab     = en ? "Lab Website" : "實驗室網頁";
  const labelHome    = en ? "Personal Website" : "個人網頁";
  const labelOffice  = en ? "Office: " : "Office：";
  const labelLabLoc  = en ? "Lab: " : "Lab：";

  const html = FACULTY.map(p => {
    const initials = p.nameEn.split(" ").map(s => s[0]).slice(0,2).join("").toUpperCase();
    const photoBlock = p.photo
      ? `<img class="faculty-photo" src="${p.photo}" alt="${p.nameEn}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
         <div class="faculty-photo-fallback" style="display:none">${initials}</div>`
      : `<div class="faculty-photo-fallback" style="display:flex">${initials}</div>`;

    const links = [];
    if (p.labUrl)   links.push(`<a class="faculty-link-btn" href="${p.labUrl}" target="_blank" rel="noopener">${ICON.flask}<span>${labelLab}</span>${ICON.arrow}</a>`);
    if (p.homepage) links.push(`<a class="faculty-link-btn" href="${p.homepage}" target="_blank" rel="noopener">${ICON.globe}<span>${labelHome}</span>${ICON.arrow}</a>`);
    const linksBlock = links.length ? `<div class="faculty-links">${links.join("")}</div>` : "";

    const officeText = en ? p.officeEn : p.office;
    const labText    = en ? p.labLocEn : p.lab;
    const research   = en ? p.researchEn : p.research;
    const titleText  = en ? p.titleEn : p.title;
    const primaryName = en ? p.nameEn : p.nameZh;
    const secondaryName = en ? p.nameZh : p.nameEn;

    const office = officeText ? `<div class="faculty-meta-row">${ICON.office}<span>${labelOffice}${officeText}</span></div>` : "";
    const lab    = labText    ? `<div class="faculty-meta-row">${ICON.lab}<span>${labelLabLoc}${labText}</span></div>` : "";
    const mail   = p.email    ? `<div class="faculty-meta-row">${ICON.mail}<a href="mailto:${p.email}">${p.email}</a></div>` : "";

    return `
      <article class="faculty-card reveal is-visible">
        <div class="faculty-photo-wrap">
          ${photoBlock}
          <span class="faculty-title-tag">${titleText}</span>
        </div>
        <div class="faculty-info">
          <div class="faculty-name">
            <span class="faculty-name-zh">${primaryName}</span>
            <span class="faculty-name-en">${secondaryName}</span>
          </div>
          <p class="faculty-research">${research}</p>
          <div class="faculty-meta">
            ${office}${lab}${mail}
          </div>
          ${linksBlock}
        </div>
      </article>
    `;
  }).join("");

  grid.innerHTML = html;
}

// ---------- Mobile menu ----------
function setupMobileMenu() {
  const header = document.getElementById("siteHeader");
  const btn = document.getElementById("menuToggle");
  if (!header || !btn) return;
  btn.addEventListener("click", () => header.classList.toggle("menu-open"));
  header.querySelectorAll(".nav a").forEach(a =>
    a.addEventListener("click", () => header.classList.remove("menu-open"))
  );
}

// ---------- Language toggle ----------
// 元素若有 data-i18n-en 屬性，內容會在中/英之間切換；
// 首次切換時自動快取原始中文 (data-i18n-zh)，之後可雙向切換。
function applyLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";

  document.querySelectorAll("[data-i18n-en]").forEach(el => {
    if (!el.dataset.i18nZh) {
      el.dataset.i18nZh = el.innerHTML;  // cache
    }
    el.innerHTML = lang === "en" ? el.dataset.i18nEn : el.dataset.i18nZh;
  });

  // 切換按鈕顯示
  const btn = document.getElementById("langToggle");
  if (btn) {
    const cur = btn.querySelector(".lang-current");
    const oth = btn.querySelector(".lang-other");
    if (lang === "en") { cur.textContent = "EN"; oth.textContent = "中"; }
    else               { cur.textContent = "中";  oth.textContent = "EN"; }
  }

  // 重新渲染教授卡片
  renderFaculty();
}

function setupLangToggle() {
  const btn = document.getElementById("langToggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    applyLang(currentLang === "en" ? "zh" : "en");
  });
}

// ---------- Scroll reveal ----------
function setupScrollReveal() {
  const items = document.querySelectorAll(".reveal:not(.is-visible)");
  if (!("IntersectionObserver" in window)) {
    items.forEach(el => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  items.forEach(el => io.observe(el));
}

// ---------- Back to top ----------
function setupBackToTop() {
  const btn = document.getElementById("backToTop");
  if (!btn) return;
  const onScroll = () => {
    if (window.scrollY > 600) btn.classList.add("is-visible");
    else btn.classList.remove("is-visible");
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  onScroll();
}

// ---------- Nav active section highlight ----------
function setupNavHighlight() {
  const links = Array.from(document.querySelectorAll(".nav a[href^='#']"));
  const sections = links
    .map(a => document.querySelector(a.getAttribute("href")))
    .filter(Boolean);
  if (!sections.length || !("IntersectionObserver" in window)) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        links.forEach(a => {
          a.classList.toggle("is-active", a.getAttribute("href") === "#" + id);
        });
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px", threshold: 0 });
  sections.forEach(s => io.observe(s));
}

// ---------- Footer year ----------
function setupYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
}

// ---------- Boot ----------
document.addEventListener("DOMContentLoaded", () => {
  renderFaculty();
  setupMobileMenu();
  setupLangToggle();
  setupYear();
  setupScrollReveal();
  setupBackToTop();
  setupNavHighlight();
});
