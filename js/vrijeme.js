/*
 * Modul: vremenska prognoza (opća i za poljoprivrednike).
 * Podaci: Open-Meteo (https://open-meteo.com), besplatno za nekomercijalnu uporabu, CC BY 4.0;
 * modeli DWD ICON, ECMWF i drugi. Za službena upozorenja upućuje se na DHMZ (meteo.hr).
 */
(function () {
  'use strict';
  let stanje = null, el = null, podaci = null, vrijemeDohvata = 0, mjesto = null;

  const KODOVI = {
    0: ['vedro', '☀️'], 1: ['pretežno vedro', '🌤️'], 2: ['djelomično oblačno', '⛅'], 3: ['oblačno', '☁️'],
    45: ['magla', '🌫️'], 48: ['magla s injem', '🌫️'], 51: ['slaba rosulja', '🌦️'], 53: ['rosulja', '🌦️'], 55: ['jaka rosulja', '🌧️'],
    56: ['ledena rosulja', '🌧️'], 57: ['ledena rosulja', '🌧️'], 61: ['slaba kiša', '🌦️'], 63: ['kiša', '🌧️'], 65: ['jaka kiša', '🌧️'],
    66: ['ledena kiša', '🌧️'], 67: ['ledena kiša', '🌧️'], 71: ['slab snijeg', '🌨️'], 73: ['snijeg', '🌨️'], 75: ['jak snijeg', '❄️'],
    77: ['zrnati snijeg', '🌨️'], 80: ['pljuskovi', '🌦️'], 81: ['pljuskovi', '🌧️'], 82: ['jaki pljuskovi', '⛈️'],
    85: ['snježni pljuskovi', '🌨️'], 86: ['snježni pljuskovi', '❄️'], 95: ['grmljavina', '⛈️'], 96: ['grmljavina s tučom', '⛈️'], 99: ['grmljavina s tučom', '⛈️']
  };
  const opis = (k) => (KODOVI[k] || ['', '🌡️']);
  const SMJER = ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ'];
  const smjer = (s) => SMJER[Math.round(s / 45) % 8];
  const DANI = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
  const zaok = (x, n = 0) => (x === null || x === undefined || isNaN(x)) ? '–' : Number(x).toFixed(n).replace('.', ',');

  async function dohvati(lat, lon) {
    const p = new URLSearchParams({
      latitude: lat.toFixed(3), longitude: lon.toFixed(3), timezone: 'Europe/Zagreb', past_days: 7, forecast_days: 7,
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
      hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,soil_temperature_6cm,soil_moisture_3_to_9cm,et0_fao_evapotranspiration,dew_point_2m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,et0_fao_evapotranspiration,sunshine_duration'
    });
    const o = await fetch('https://api.open-meteo.com/v1/forecast?' + p);
    if (!o.ok) throw new Error('Prognoza nije dostupna (' + o.status + ')');
    return o.json();
  }

  function mjestoPrognoze() {
    // središte karte ako je unutar općine, inače Bilje
    const v = stanje.karta.getView();
    const c = v.getCenter();
    if (stanje.granicaExtent && ol.extent.containsCoordinate(stanje.granicaExtent, c)) {
      const [lon, lat] = ol.proj.toLonLat(c);
      return { lon, lat, naziv: 'središte karte' };
    }
    return { lon: 18.745, lat: 45.604, naziv: 'Bilje' };
  }

  async function osvjezi(prisilno) {
    const m = mjestoPrognoze();
    const pomak = !mjesto || Math.hypot(m.lon - mjesto.lon, m.lat - mjesto.lat) > 0.03;
    if (!prisilno && podaci && !pomak && Date.now() - vrijemeDohvata < 30 * 60e3) return;
    podaci = await dohvati(m.lat, m.lon);
    mjesto = m; vrijemeDohvata = Date.now();
    osvjeziGumb();
  }

  function osvjeziGumb() {
    const g = document.getElementById('gumbVrijeme');
    if (!g || !podaci) return;
    const c = podaci.current;
    g.querySelector('.vrijeme-ikona').textContent = opis(c.weather_code)[1];
    g.querySelector('.vrijeme-temp').textContent = zaok(c.temperature_2m) + '°';
  }

  // ---------- izračuni za poljoprivrednike ----------
  function satniIndeksi() {
    const h = podaci.hourly;
    const sada = podaci.current.time.slice(0, 13);
    const i0 = Math.max(0, h.time.findIndex(t => t.slice(0, 13) >= sada));
    return { h, i0 };
  }

  // prozor za prskanje: vjetar 3–15 km/h, udari ≤ 25, bez oborine sada i sljedeća 3 sata, 8–25 °C, vlaga ≥ 45 %
  function uvjetiPrskanja(h, i) {
    const kisa = [0, 1, 2, 3].some(k => (h.precipitation[i + k] || 0) > 0.1 || (h.precipitation_probability[i + k] || 0) > 30);
    const v = h.wind_speed_10m[i], u = h.wind_gusts_10m[i], t = h.temperature_2m[i], rh = h.relative_humidity_2m[i];
    if (kisa) return { ok: false, razlog: 'oborina' };
    if (v > 15 || u > 25) return { ok: false, razlog: 'vjetar' };
    if (v < 3) return { ok: 'oprez', razlog: 'zatišje (moguća inverzija)' };
    if (t < 8 || t > 25) return { ok: 'oprez', razlog: t > 25 ? 'vruće' : 'hladno' };
    if (rh < 45) return { ok: 'oprez', razlog: 'suh zrak' };
    return { ok: true, razlog: 'povoljno' };
  }

  function prikaziOpce() {
    const c = podaci.current, d = podaci.daily;
    const danas = d.time.indexOf(c.time.slice(0, 10));
    const dani = d.time.map((t, i) => ({ t, i })).filter(x => x.i >= danas).slice(0, 7);
    return el('div', { class: 'vrijeme-opce' },
      el('div', { class: 'vrijeme-sada' },
        el('span', { class: 'vrijeme-velika-ikona' }, opis(c.weather_code)[1]),
        el('div', {}, el('div', { class: 'vrijeme-velika-temp' }, zaok(c.temperature_2m) + ' °C'),
          el('div', { class: 'sitno-siva' }, opis(c.weather_code)[0] + ' · osjet ' + zaok(c.apparent_temperature) + ' °C')),
        el('div', { class: 'vrijeme-detalji' },
          el('div', {}, '💨 ' + zaok(c.wind_speed_10m) + ' km/h ' + smjer(c.wind_direction_10m) + (c.wind_gusts_10m > 30 ? ' (udari ' + zaok(c.wind_gusts_10m) + ')' : '')),
          el('div', {}, '💧 vlaga ' + zaok(c.relative_humidity_2m) + ' %'))),
      el('div', { class: 'vrijeme-dani' }, ...dani.map(({ t, i }) => {
        const dt = new Date(t + 'T12:00:00');
        return el('div', { class: 'vrijeme-dan' },
          el('div', { class: 'dan-naziv' }, i === danas ? 'danas' : DANI[dt.getDay()] + ' ' + dt.getDate() + '.'),
          el('div', { class: 'dan-ikona', title: opis(d.weather_code[i])[0] }, opis(d.weather_code[i])[1]),
          el('div', { class: 'dan-temp' }, el('strong', {}, zaok(d.temperature_2m_max[i]) + '°'), ' ', el('span', {}, zaok(d.temperature_2m_min[i]) + '°')),
          el('div', { class: 'dan-kisa' + (d.precipitation_sum[i] >= 1 ? ' ima' : '') }, d.precipitation_sum[i] >= 0.1 ? zaok(d.precipitation_sum[i], 1) + ' mm' : '–'),
          el('div', { class: 'dan-vjetar' }, zaok(d.wind_gusts_10m_max[i]) + ' km/h'));
      })),
      el('p', { class: 'sitno-siva' }, 'Oborina u mm, udari vjetra u km/h.'));
  }

  function prikaziPoljoprivreda() {
    const d = podaci.daily, { h, i0 } = satniIndeksi();
    const danas = d.time.indexOf(podaci.current.time.slice(0, 10));
    const zbroj = (niz, a, b) => niz.slice(a, b).reduce((s, x) => s + (x || 0), 0);
    const kisaProslo = zbroj(d.precipitation_sum, Math.max(0, danas - 7), danas);
    const etProslo = zbroj(d.et0_fao_evapotranspiration, Math.max(0, danas - 7), danas);
    const kisaBuduce = zbroj(d.precipitation_sum, danas, danas + 7);
    const etBuduce = zbroj(d.et0_fao_evapotranspiration, danas, danas + 7);
    const mraz = d.time.map((t, i) => ({ t, i, min: d.temperature_2m_min[i] })).filter(x => x.i >= danas && x.min <= 2);

    // prskanje: sljedećih 48 sati
    const sati = [];
    for (let i = i0; i < Math.min(i0 + 48, h.time.length - 3); i++) sati.push({ i, ...uvjetiPrskanja(h, i) });
    const prviDobar = sati.find(s => s.ok === true);
    const tlo = h.soil_temperature_6cm[i0], vlagaTla = h.soil_moisture_3_to_9cm[i0];

    const kartica = (naslov, vrijednost, dodatak, klasa) => el('div', { class: 'agro-kartica ' + (klasa || '') },
      el('div', { class: 'agro-naslov' }, naslov), el('div', { class: 'agro-vrijednost' }, vrijednost), el('div', { class: 'agro-dodatak' }, dodatak || ''));

    const bilancaProslo = kisaProslo - etProslo, bilancaBuduce = kisaBuduce - etBuduce;
    return el('div', { class: 'vrijeme-agro' },
      el('div', { class: 'agro-mreza' },
        kartica('Oborina zadnjih 7 dana', zaok(kisaProslo, 1) + ' mm', 'isparavanje (ET₀) ' + zaok(etProslo, 1) + ' mm → bilanca ' + (bilancaProslo >= 0 ? '+' : '') + zaok(bilancaProslo, 1) + ' mm', bilancaProslo < -15 ? 'upozorenje' : ''),
        kartica('Oborina sljedećih 7 dana', zaok(kisaBuduce, 1) + ' mm', 'ET₀ ' + zaok(etBuduce, 1) + ' mm → bilanca ' + (bilancaBuduce >= 0 ? '+' : '') + zaok(bilancaBuduce, 1) + ' mm', bilancaBuduce < -15 ? 'upozorenje' : ''),
        kartica('Tlo (6 cm)', zaok(tlo, 1) + ' °C', 'vlažnost 3–9 cm: ' + (vlagaTla != null ? zaok(vlagaTla * 100) + ' vol. %' : '–') + (tlo >= 10 ? ' · povoljno za sjetvu kukuruza' : tlo >= 8 ? ' · blizu praga za kukuruz (10 °C)' : '')),
        kartica('Mraz', mraz.length ? '⚠️ ' + mraz.map(x => DANI[new Date(x.t + 'T12:00:00').getDay()] + ' ' + zaok(x.min) + '°').join(', ') : 'nema rizika',
          mraz.length ? 'najniža temperatura zraka ≤ 2 °C – mogući prizemni mraz' : 'sljedećih 7 dana', mraz.length ? 'upozorenje' : 'dobro')),
      el('div', { class: 'agro-prskanje' },
        el('div', { class: 'agro-naslov' }, 'Uvjeti za prskanje – sljedećih 48 sati'),
        el('div', { class: 'prskanje-traka' }, ...sati.map(s => {
          const t = h.time[s.i];
          return el('span', { class: 'sat ' + (s.ok === true ? 'dobro' : s.ok === 'oprez' ? 'oprez' : 'lose'),
            title: t.slice(8, 10) + '.' + t.slice(5, 7) + '. ' + t.slice(11, 16) + ' – ' + s.razlog + ', vjetar ' + zaok(h.wind_speed_10m[s.i]) + ' km/h, ' + zaok(h.temperature_2m[s.i]) + ' °C' }, '');
        })),
        el('div', { class: 'prskanje-oznake' }, el('span', {}, 'sada'), el('span', {}, '+24 h'), el('span', {}, '+48 h')),
        el('p', { class: 'sitno-siva' }, prviDobar ? 'Prvi povoljan termin: ' + h.time[prviDobar.i].slice(8, 10) + '.' + h.time[prviDobar.i].slice(5, 7) + '. u ' + h.time[prviDobar.i].slice(11, 16) + ' h.' : 'U sljedećih 48 sati nema potpuno povoljnog termina.',
          ' Zeleno: vjetar 3–15 km/h, bez kiše 3 sata, 8–25 °C. Uvijek se pridržavajte uputa na etiketi sredstva.')),
      el('p', { class: 'sitno-siva' }, 'ET₀ je referentno isparavanje (FAO-56) – koliko bi vode potrošio dobro opskrbljen travnjak; stvarna potrošnja usjeva ovisi o kulturi i fazi razvoja.'));
  }

  async function otvori() {
    const sadrzaj = el('div', { class: 'vrijeme' }, el('p', {}, 'Učitavam prognozu…'));
    const kartice = el('div', { class: 'kartice-dijaloga' });
    stanje.api.otvoriDijalog(el('h3', {}, 'Vremenska prognoza'), kartice, sadrzaj);
    try { await osvjezi(); } catch (g) { sadrzaj.replaceChildren(el('p', { class: 'poruka greska' }, g.message)); return; }
    const izvori = el('p', { class: 'sitno-siva' }, 'Prognoza za ' + mjesto.naziv + ' (' + zaok(mjesto.lat, 3) + ', ' + zaok(mjesto.lon, 3) + '), podaci: ',
      el('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener' }, 'Open-Meteo'), ' (modeli DWD, ECMWF, CC BY 4.0). Službena prognoza i upozorenja: ',
      el('a', { href: 'https://meteo.hr/prognoze.php?section=prognoze_metp&param=3d', target: '_blank', rel: 'noopener' }, 'DHMZ'), ', ',
      el('a', { href: 'https://meteo.hr/agro.php?section=agro&param=agro_prognoza', target: '_blank', rel: 'noopener' }, 'agrometeorološka prognoza DHMZ'), ', ',
      el('a', { href: 'https://meteoalarm.org/hr/live/region/HR', target: '_blank', rel: 'noopener' }, 'Meteoalarm'), '.');
    const prikazi = (koji) => {
      for (const b of kartice.children) b.classList.toggle('aktivna', b.dataset.k === koji);
      sadrzaj.replaceChildren(koji === 'agro' ? prikaziPoljoprivreda() : prikaziOpce(), izvori);
    };
    kartice.replaceChildren(
      el('button', { 'data-k': 'opce', onclick: () => prikazi('opce') }, 'Opća prognoza'),
      el('button', { 'data-k': 'agro', onclick: () => prikazi('agro') }, 'Za poljoprivrednike'));
    prikazi('opce');
  }

  function pokreni(s) {
    stanje = s; el = s.api.el;
    s.akcije.vrijeme = () => otvori();
    s.akcije.agro = () => { otvori(); setTimeout(() => { const g = document.querySelector('#dijalog [data-k="agro"]'); if (g) g.click(); }, 400); };
    const okvir = document.querySelector('.gumbi-karte');
    if (!okvir) return;
    const gumb = el('button', { id: 'gumbVrijeme', class: 'gumb-karte gumb-vrijeme', title: 'Vremenska prognoza', onclick: otvori },
      el('span', { class: 'vrijeme-ikona' }, '🌡️'), el('span', { class: 'vrijeme-temp' }, ''));
    okvir.prepend(gumb);
    osvjezi().catch(() => { gumb.hidden = true; });
    s.vrijeme = { otvori };
  }

  (window.webgisModuli = window.webgisModuli || []).push({ naziv: 'vrijeme', pokreni });
})();
