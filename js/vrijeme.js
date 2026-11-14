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


  // ---------- tumačenje za poljoprivrednike: što vrijednosti znače za radove u polju ----------
  // Pojednostavljena pravila (agronomska praksa za istočnu Hrvatsku); savjet, ne zamjena za stručnu službu i etiketu sredstva.
  const KULTURE = {
    opce: 'Općenito (svi radovi)', psenica: 'Pšenica / ječam (ozimi)', kukuruz: 'Kukuruz', suncokret: 'Suncokret', soja: 'Soja',
    repa: 'Šećerna repa', repica: 'Uljana repica', loza: 'Vinova loza', vocnjak: 'Voćnjak (jabuka, šljiva…)', povrce: 'Povrće (paprika, rajčica…)'
  };

  function agroPokazatelji() {
    const d = podaci.daily, { h, i0 } = satniIndeksi();
    const danas = d.time.indexOf(podaci.current.time.slice(0, 10));
    const zb = (niz, a, b) => niz.slice(Math.max(0, a), Math.max(0, b)).reduce((s, x) => s + (x || 0), 0);
    const sp = (niz, a, b) => { const x = niz.slice(a, b).filter(v => v != null); return x.length ? x.reduce((s, v) => s + v, 0) / x.length : null; };
    const mokriSati = (a, b) => { let n = 0; for (let i = a; i < Math.min(b, h.time.length); i++) { const t = h.temperature_2m[i]; if ((h.relative_humidity_2m[i] >= 90 || h.precipitation[i] > 0.1) && t >= 10 && t <= 25) n++; } return n; };
    const suhiDani = (() => { let n = 0; for (let i = danas; i < d.time.length; i++) { if ((d.precipitation_sum[i] || 0) < 1 && (d.precipitation_probability_max[i] || 0) < 40) n++; else break; } return n; })();
    return {
      mjesec: Number(podaci.current.time.slice(5, 7)),
      kisa3proslo: zb(d.precipitation_sum, danas - 3, danas), kisa7proslo: zb(d.precipitation_sum, danas - 7, danas),
      kisa24: zb(h.precipitation, i0, i0 + 24), kisa72: zb(h.precipitation, i0, i0 + 72), kisa7: zb(d.precipitation_sum, danas, danas + 7),
      maks48kisa: Math.max(zb(h.precipitation, i0, i0 + 24), zb(h.precipitation, i0 + 24, i0 + 48)),
      bilanca7: zb(d.precipitation_sum, danas, danas + 7) - zb(d.et0_fao_evapotranspiration, danas, danas + 7),
      bilancaProslo: zb(d.precipitation_sum, danas - 7, danas) - zb(d.et0_fao_evapotranspiration, danas - 7, danas),
      tlo: h.soil_temperature_6cm[i0], tlo72: sp(h.soil_temperature_6cm, Math.max(0, i0 - 72), i0 + 1),
      tloMin72: Math.min(...h.soil_temperature_6cm.slice(i0, i0 + 72).filter(v => v != null)),
      vlaga: h.soil_moisture_3_to_9cm[i0],
      tmin: Math.min(...d.temperature_2m_min.slice(danas, danas + 7)), tmin3: Math.min(...d.temperature_2m_min.slice(danas, danas + 3)),
      tmax: Math.max(...d.temperature_2m_max.slice(danas, danas + 7)),
      vruciDani: d.temperature_2m_max.slice(danas, danas + 7).filter(t => t >= 32).length,
      tSred48: sp(h.temperature_2m, i0, i0 + 48), mokri48: mokriSati(i0, i0 + 48), suhiDani
    };
  }

  // savjet = [razina, naslov, objašnjenje]; razina: 'dobro' | 'oprez' | 'upozorenje' | 'info'
  function savjetiZaKulturu(k, x) {
    const s = [], m = x.mjesec, uMj = (...mj) => mj.includes(m);
    const prohodno = x.kisa3proslo < 10 && (x.vlaga == null || x.vlaga < 0.36);
    const premokro = x.kisa3proslo >= 20 || (x.vlaga != null && x.vlaga >= 0.40);
    // opći radovi – vrijede za sve kulture
    if (premokro) s.push(['upozorenje', 'Tlo je premokro za strojeve', 'U zadnja 3 dana palo je ' + zaok(x.kisa3proslo) + ' mm. Teški strojevi sada zbijaju tlo i ostavljaju kolotrage; pričekajte da se prosuši.']);
    else if (prohodno) s.push(['dobro', 'Tlo je prohodno za strojeve', 'Malo oborine u zadnja 3 dana' + (x.vlaga != null ? ', vlažnost površinskog sloja ' + zaok(x.vlaga * 100) + ' %' : '') + ' – povoljno za obradu, sjetvu i rad mehanizacijom.']);
    if (x.tlo != null && x.tlo <= 0) s.push(['upozorenje', 'Tlo je smrznuto – bez gnojidbe', 'Na smrznuto, snijegom pokriveno ili vodom zasićeno tlo gnojiva se ne smiju primjenjivati (ispiranje u vode).']);
    else if (x.kisa72 >= 25) s.push(['oprez', 'Gnojidbu dušikom odgodite', 'U sljedeća 3 dana očekuje se ' + zaok(x.kisa72) + ' mm kiše – jaka kiša ispire dušik u dublje slojeve i kanale.']);
    else if (x.kisa72 >= 5 && x.kisa72 < 20 && !premokro) s.push(['dobro', 'Dobar trenutak za prihranu', 'Očekuje se umjerena kiša (' + zaok(x.kisa72) + ' mm u 3 dana) koja će otopiti i unijeti gnojivo u tlo.']);
    if (x.suhiDani >= 3) s.push(['dobro', x.suhiDani + ' suha dana zaredom', 'Povoljno za košnju i sušenje sijena, žetvu, berbu i radove koji traže suho vrijeme.']);
    else if (x.kisa7 >= 30) s.push(['info', 'Kišan tjedan pred nama', 'Do ' + zaok(x.kisa7) + ' mm u 7 dana – planirajte radove u suhim prozorima, a žetvu/berbu prije kiše.']);
    if (x.bilanca7 < -15 && uMj(4, 5, 6, 7, 8, 9)) s.push(['oprez', 'Usjevi će trošiti više vode nego što padne', 'Bilanca sljedećih 7 dana: ' + zaok(x.bilanca7) + ' mm. Ako navodnjavate, sada je vrijeme; na lakšim tlima manjak se brže osjeti.']);
    if (x.tmin <= -2 && uMj(3, 4, 5)) s.push(['upozorenje', 'Kasni proljetni mraz', 'Najniža temperatura do ' + zaok(x.tmin) + ' °C – opasno za cvat voćaka, mladice vinove loze i nicanje proljetnih kultura.']);
    if (x.vruciDani >= 2) s.push(['oprez', 'Toplinski stres', x.vruciDani + ' dana s 32 °C i više. Prskanje i rad u polju rano ujutro ili navečer; usjevi u cvatnji su najosjetljiviji.']);

    const kult = {
      psenica: () => {
        if (uMj(9, 10)) s.push(x.tlo72 != null && x.tlo72 > 14 && m === 9 ? ['info', 'Za pšenicu je još rano', 'Optimalni rok sjetve ozime pšenice u Slavoniji i Baranji je oko 5.–25. listopada; ranija sjetva pojačava napad lisnih uši i bolesti.'] : ['dobro', 'Rok sjetve ozimih žitarica', 'Ječam sije se ranije (kraj rujna – sredina listopada), pšenica od početka do kraja listopada. ' + (prohodno ? 'Tlo je sada prohodno.' : 'Pričekajte da se tlo prosuši.')]);
        if (uMj(11, 12, 1, 2)) s.push(x.tmin <= -15 ? ['upozorenje', 'Opasnost od izmrzavanja', 'Mrazevi ispod −15 °C bez snježnog pokrivača mogu oštetiti ozime usjeve.'] : ['info', 'Zimsko mirovanje', 'Ozimi usjevi miruju; pratite stagnaciju vode na parcelama nakon jačih kiša.']);
        if (uMj(2, 3)) s.push(['info', 'Prva prihrana dušikom', 'Kad se tlo odmrzne i postane prohodno (kraj veljače – ožujak). ' + (prohodno && x.tlo > 0 ? 'Uvjeti su sada povoljni.' : '')]);
        if (uMj(5) && x.mokri48 >= 12 && x.tSred48 >= 15) s.push(['upozorenje', 'Rizik od fuzarijske paleži klasa', 'Toplo i vlažno vrijeme u vrijeme cvatnje (' + x.mokri48 + ' vlažnih sati u 48 h) pogoduje fuzariozi – razmotrite zaštitu u cvatnji.']);
        if (uMj(6, 7)) s.push(x.suhiDani >= 2 ? ['dobro', 'Uvjeti za žetvu', 'Suho vrijeme – zrno se brzo dosušuje.'] : ['oprez', 'Kiša usporava žetvu', 'Vlažno zrno i polijeganje; pratite suhe prozore.']);
      },
      kukuruz: () => {
        if (uMj(3, 4, 5)) {
          if (x.tlo72 != null && x.tlo72 >= 10 && x.tloMin72 >= 8) s.push(['dobro', 'Tlo je dovoljno toplo za sjetvu kukuruza', 'Prosjek tla na 6 cm zadnja 3 dana ' + zaok(x.tlo72, 1) + ' °C (prag 10 °C). ' + (prohodno ? 'Tlo je prohodno – može se sijati.' : 'Pričekajte da se tlo prosuši.')]);
          else s.push(['info', 'Za kukuruz je tlo još hladno', 'Tlo na 6 cm: ' + zaok(x.tlo72, 1) + ' °C. Sjetva kad se tlo ustali na 10 °C i više – inače je nicanje sporo i neujednačeno.']);
        }
        if (uMj(6) && x.kisa7 >= 5 && x.kisa7 < 25) s.push(['info', 'Međuredna kultivacija i prihrana', 'Do zatvaranja redova; umjerena kiša nakon prihrane je poželjna.']);
        if (uMj(7)) s.push(x.vruciDani >= 2 || x.bilanca7 < -20 ? ['upozorenje', 'Kukuruz u cvatnji – kritično razdoblje', 'Vrućina i manjak vode u metličanju i svilanju najviše smanjuju prinos; navodnjavanje sada ima najveći učinak.'] : ['dobro', 'Povoljni uvjeti za oplodnju kukuruza', 'Nema jakih vrućina ni većeg manjka vode.']);
        if (uMj(9, 10, 11)) s.push(x.suhiDani >= 2 ? ['dobro', 'Berba kukuruza', 'Suho vrijeme smanjuje troškove sušenja zrna i olakšava ulazak kombajna.'] : ['oprez', 'Berba – vlažno', 'Kiša povećava vlagu zrna i zbija tlo pod kombajnom.']);
      },
      suncokret: () => {
        if (uMj(3, 4, 5)) s.push(x.tlo72 >= 8 ? ['dobro', 'Tlo je toplo za sjetvu suncokreta', 'Prag je 8 °C na dubini sjetve (sada ' + zaok(x.tlo72, 1) + ' °C).'] : ['info', 'Za suncokret je tlo još hladno', 'Sjetva kad tlo dosegne 8 °C (sada ' + zaok(x.tlo72, 1) + ' °C).']);
        if (uMj(7, 8) && x.mokri48 >= 12) s.push(['oprez', 'Vlažno – rizik od bolesti glavice', 'Dugo vlažno razdoblje pogoduje bijeloj i sivoj truleži.']);
        if (uMj(8, 9)) s.push(x.suhiDani >= 2 ? ['dobro', 'Žetva suncokreta', 'Suho vrijeme – povoljno za žetvu.'] : ['oprez', 'Žetva suncokreta – vlažno', 'Kiša u žetvi povećava gubitke i truleži.']);
      },
      soja: () => {
        if (uMj(4, 5)) s.push(x.tlo72 >= 10 ? ['dobro', 'Tlo je toplo za sjetvu soje', 'Soja traži barem 10 °C u tlu (sada ' + zaok(x.tlo72, 1) + ' °C); hladno tlo usporava nicanje.'] : ['info', 'Za soju je tlo još hladno', 'Pričekajte 10 °C u tlu (sada ' + zaok(x.tlo72, 1) + ' °C).']);
        if (uMj(7, 8) && x.bilanca7 < -15) s.push(['oprez', 'Soja u cvatnji i nalijevanju zrna', 'Manjak vode sada smanjuje broj mahuna i krupnoću zrna.']);
        if (uMj(9, 10)) s.push(x.suhiDani >= 2 ? ['dobro', 'Žetva soje', 'Suho vrijeme – mahune ne pucaju od vlage, zrno se brzo suši.'] : ['oprez', 'Žetva soje – vlažno', 'Pričekajte suhi prozor.']);
      },
      repa: () => {
        if (uMj(3, 4)) s.push(x.tlo72 >= 5 ? ['dobro', 'Rok sjetve šećerne repe', 'Repa se sije čim je tlo prohodno i toplije od 5 °C (sada ' + zaok(x.tlo72, 1) + ' °C).' + (prohodno ? '' : ' Tlo je još mokro.')] : ['info', 'Za repu je tlo još hladno', 'Prag je oko 5 °C u tlu.']);
        if (uMj(7, 8) && x.tSred48 >= 20 && x.mokri48 >= 10) s.push(['upozorenje', 'Rizik od pjegavosti lista (Cercospora)', 'Topli dani i vlažne noći pogoduju širenju bolesti; pregledajte usjev.']);
        if (uMj(9, 10, 11)) s.push(premokro ? ['oprez', 'Vađenje repe – mokro tlo', 'Mokro tlo zbija se pod teškim vadilicama i više ga ostaje na korijenu.'] : ['dobro', 'Uvjeti za vađenje repe', 'Tlo je dovoljno suho.']);
      },
      repica: () => {
        if (uMj(8, 9)) s.push(['info', 'Rok sjetve uljane repice', 'Kraj kolovoza – sredina rujna; repica treba dobro razvijenu rozetu prije zime. ' + (x.bilanca7 < -10 ? 'Suho je – nicanje može kasniti.' : '')]);
        if (uMj(3, 4) && x.tmin3 <= -3) s.push(['upozorenje', 'Mraz u porastu/cvatnji repice', 'Temperature do ' + zaok(x.tmin3) + ' °C mogu oštetiti cvjetne pupove.']);
        if (uMj(6, 7)) s.push(x.suhiDani >= 2 ? ['dobro', 'Žetva repice', 'Suho vrijeme – manje osipanja i lakša žetva.'] : ['oprez', 'Žetva repice – kiša', 'Kiša i vjetar povećavaju osipanje sjemena.']);
      },
      loza: () => {
        if (uMj(4, 5, 6, 7)) {
          if (x.maks48kisa >= 10 && x.tSred48 >= 10) s.push(['upozorenje', 'Pravilo 3 × 10: uvjeti za peronosporu', 'Očekuje se ≥ 10 mm kiše u 24 h pri temperaturi iznad 10 °C. Ako su mladice duže od 10 cm, moguća je primarna zaraza plamenjačom – zaštita prije kiše.']);
          else if (x.mokri48 >= 12) s.push(['oprez', 'Vlažno – pratite peronosporu', x.mokri48 + ' vlažnih sati u 48 h.']);
          if (x.tSred48 >= 20 && x.tSred48 <= 28 && x.mokri48 < 12) s.push(['oprez', 'Toplo i sparno – uvjeti za pepelnicu', 'Pepelnici odgovaraju temperature 20–27 °C i visoka vlaga zraka bez kiše.']);
        }
        if (uMj(4, 5) && x.tmin3 <= 0) s.push(['upozorenje', 'Mraz nakon kretanja vegetacije', 'Mlade mladice stradavaju već na 0 do −1 °C.']);
        if (uMj(8, 9, 10)) s.push(x.suhiDani >= 3 ? ['dobro', 'Berba grožđa', 'Suho razdoblje – grožđe ne puca i manje je sive plijesni.'] : ['oprez', 'Kiša pred berbu', 'Kiša u dozrijevanju potiče sivu plijesan i pucanje bobica.']);
      },
      vocnjak: () => {
        if (uMj(3, 4, 5) && x.tmin3 <= -1) s.push(['upozorenje', 'Mraz u cvatnji voćaka', 'U cvatnji je kritično već −1 do −2 °C (najniža očekivana ' + zaok(x.tmin3) + ' °C). Zaštita orošavanjem ili zadimljavanjem ako je imate.']);
        if (uMj(4, 5, 6) && x.mokri48 >= 9 && x.tSred48 >= 10) s.push(['upozorenje', 'Uvjeti za krastavost (čađavu pjegavost)', x.mokri48 + ' vlažnih sati pri 10–25 °C – lišće i plodovi jabuke i kruške mogu se zaraziti.']);
        if (uMj(6, 7, 8) && x.bilanca7 < -15) s.push(['oprez', 'Plodovi rastu – treba vode', 'Manjak vode u rastu plodova smanjuje krupnoću; navodnjavanje kap po kap.']);
        if (uMj(8, 9, 10)) s.push(x.suhiDani >= 2 ? ['dobro', 'Uvjeti za berbu', 'Suho vrijeme – plodovi su čvršći i bolje se skladište.'] : ['info', 'Berba – kišni dani', 'Berite u suhim prozorima.']);
      },
      povrce: () => {
        if (uMj(4, 5)) s.push(x.tmin >= 5 && x.tlo72 >= 12 ? ['dobro', 'Presađivanje na otvoreno', 'Nema mraza, a tlo ima ' + zaok(x.tlo72, 1) + ' °C – paprika i rajčica mogu van (paprika voli 15 °C i više u tlu).'] : ['oprez', 'Za presađivanje je još rano', 'Najniža temperatura ' + zaok(x.tmin) + ' °C, tlo ' + zaok(x.tlo72, 1) + ' °C. Paprika i rajčica stradavaju na hladnoći; pričekajte toplije noći.']);
        if (uMj(6, 7, 8, 9) && x.mokri48 >= 12 && x.tSred48 >= 15) s.push(['upozorenje', 'Vlažno i toplo – plamenjača rajčice i krumpira', 'Uvjeti pogoduju širenju plamenjače; preventivna zaštita prije kiše.']);
        if (uMj(6, 7, 8) && x.vruciDani >= 2) s.push(['oprez', 'Vrućina – opadanje cvjetova paprike', 'Iznad 32 °C paprika odbacuje cvjetove; navodnjavanje i zasjena pomažu.']);
        if (uMj(6, 7, 8) && x.bilanca7 < -10) s.push(['oprez', 'Povrće treba redovito zalijevanje', 'Bilanca sljedećih 7 dana ' + zaok(x.bilanca7) + ' mm.']);
      }
    };
    if (kult[k]) kult[k]();
    if (!s.length) s.push(['info', 'Nema posebnih upozorenja', 'Za odabranu kulturu i ovo doba godine vrijeme ne traži posebne mjere.']);
    const red = { upozorenje: 0, oprez: 1, dobro: 2, info: 3 };
    return s.sort((a, b) => red[a[0]] - red[b[0]]);
  }


  // ---------- toplinske jedinice (GDD, zbroj efektivnih temperatura) ----------
  // Dnevno: (min(Tmax, 30) + max(Tmin, baza)) / 2 − baza, ne manje od 0. Usporedba s prosjekom 1995.–2024. (ERA5, Open-Meteo arhiva).
  const GDD = {
    opce: { baza: 5, pocetak: '01-01', naziv: 'od 1. siječnja, baza 5 °C' },
    psenica: { baza: 0, pocetak: '01-01', naziv: 'od 1. siječnja, baza 0 °C' },
    kukuruz: { baza: 10, pocetak: '04-15', naziv: 'od sjetve, baza 10 °C' },
    suncokret: { baza: 7, pocetak: '04-10', naziv: 'od sjetve, baza 7 °C' },
    soja: { baza: 10, pocetak: '04-25', naziv: 'od sjetve, baza 10 °C' },
    repa: { baza: 3, pocetak: '03-20', naziv: 'od sjetve, baza 3 °C' },
    repica: { baza: 0, pocetak: '01-01', naziv: 'od 1. siječnja, baza 0 °C' },
    loza: { baza: 10, pocetak: '04-01', naziv: 'od 1. travnja, baza 10 °C' },
    vocnjak: { baza: 5, pocetak: '03-01', naziv: 'od 1. ožujka, baza 5 °C' },
    povrce: { baza: 10, pocetak: '05-10', naziv: 'od sadnje, baza 10 °C' }
  };
  let arhiva = null, arhivaMjesto = null;
  const gddDan = (tmax, tmin, b) => (tmax == null || tmin == null) ? 0 : Math.max(0, (Math.min(tmax, 30) + Math.max(Math.min(tmin, 30), b)) / 2 - b);

  async function dohvatiArhivu() {
    const kljuc = mjesto.lat.toFixed(2) + ',' + mjesto.lon.toFixed(2);
    if (arhiva && arhivaMjesto === kljuc) return arhiva;
    const d = new Date(); d.setDate(d.getDate() - 6);
    const kraj = d.toISOString().slice(0, 10);
    const p = new URLSearchParams({ latitude: mjesto.lat.toFixed(3), longitude: mjesto.lon.toFixed(3), start_date: '1995-01-01', end_date: kraj,
      daily: 'temperature_2m_max,temperature_2m_min', timezone: 'Europe/Zagreb' });
    const o = await fetch('https://archive-api.open-meteo.com/v1/archive?' + p);
    if (!o.ok) throw new Error('arhiva ' + o.status);
    const j = await o.json();
    const dani = {};
    j.daily.time.forEach((t, i) => { dani[t] = [j.daily.temperature_2m_max[i], j.daily.temperature_2m_min[i]]; });
    // dopuni zadnje dane iz prognoze (prošlih 7 + sljedećih 7 dana)
    const f = podaci.daily;
    f.time.forEach((t, i) => { if (!dani[t]) dani[t] = [f.temperature_2m_max[i], f.temperature_2m_min[i], true]; });
    arhiva = dani; arhivaMjesto = kljuc;
    return dani;
  }

  function izracunGDD(dani, kultura, pocetak) {
    const c = GDD[kultura] || GDD.opce;
    const danas = podaci.current.time.slice(0, 10), god = Number(danas.slice(0, 4));
    const poc = pocetak || c.pocetak;
    const krivulja = (g, doDatuma) => {
      const izlaz = []; let s = 0;
      const d = new Date(g + '-' + poc + 'T12:00:00'), kraj = new Date(doDatuma + 'T12:00:00');
      while (d <= kraj) {
        const k = d.toISOString().slice(0, 10), v = dani[k];
        if (v) s += gddDan(v[0], v[1], c.baza);
        izlaz.push({ k: k.slice(5), s, prognoza: v && v[2] });
        d.setDate(d.getDate() + 1);
      }
      return izlaz;
    };
    const zadnjiPodatak = Object.keys(dani).sort().pop();
    if (danas.slice(5) < poc) return { prije: true, c, poc };
    const tekuca = krivulja(god, zadnjiPodatak);
    const doDanas = tekuca.filter(x => x.k <= danas.slice(5));
    // prosjek 1995.–2024. za isti kalendarski dan
    const prosjek = {}; let n = 0;
    for (let g = 1995; g <= 2024; g++) {
      const kr = krivulja(g, g + '-12-31'); if (!kr.length) continue; n++;
      for (const x of kr) prosjek[x.k] = (prosjek[x.k] || 0) + x.s;
    }
    for (const k in prosjek) prosjek[k] /= n;
    const sada = doDanas.length ? doDanas[doDanas.length - 1].s : 0;
    const prosjekDanas = prosjek[danas.slice(5)] || 0;
    // koliko je dana sezona ispred/iza: razlika podijeljena s prosječnim dnevnim prirastom u zadnja dva tjedna
    const kljucevi = Object.keys(prosjek).sort();
    const idx = kljucevi.indexOf(danas.slice(5));
    const prirast = idx >= 14 ? (prosjek[kljucevi[idx]] - prosjek[kljucevi[idx - 14]]) / 14 : 0;
    const pomak = prirast >= 3 ? Math.max(-40, Math.min(40, Math.round((sada - prosjekDanas) / prirast))) : null;
    const zaTjedan = tekuca.length ? tekuca[tekuca.length - 1].s - sada : 0;
    return { c, poc, sada, prosjekDanas, pomak, zaTjedan, tekuca, prosjek, kljucevi, danas: danas.slice(5) };
  }

  function grafGDD(r) {
    const ns = 'http://www.w3.org/2000/svg', W = 300, H = 90;
    const xs = r.kljucevi.filter(k => k >= r.poc);
    const max = Math.max(r.prosjek[xs[xs.length - 1]] || 1, r.tekuca.length ? r.tekuca[r.tekuca.length - 1].s : 1);
    const X = i => i / (xs.length - 1) * W, Y = v => H - 4 - v / max * (H - 8);
    const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'gdd-graf');
    const linija = (tocke, klasa) => { const p = document.createElementNS(ns, 'polyline'); p.setAttribute('points', tocke); p.setAttribute('class', klasa); svg.append(p); };
    linija(xs.map((k, i) => X(i).toFixed(1) + ',' + Y(r.prosjek[k]).toFixed(1)).join(' '), 'prosjek');
    const pos = Object.fromEntries(xs.map((k, i) => [k, i]));
    linija(r.tekuca.filter(t => !t.prognoza && pos[t.k] !== undefined).map(t => X(pos[t.k]).toFixed(1) + ',' + Y(t.s).toFixed(1)).join(' '), 'tekuca');
    linija(r.tekuca.filter(t => t.prognoza && pos[t.k] !== undefined).map(t => X(pos[t.k]).toFixed(1) + ',' + Y(t.s).toFixed(1)).join(' '), 'prognoza');
    return svg;
  }

  function opisGDD(r, kultura) {
    const k = KULTURE[kultura] || '';
    if (r.prije) return 'Za ' + k.toLowerCase() + ' zbrajanje počinje ' + r.poc.split('-').reverse().join('. ') + '.';
    if (r.pomak === null) {
      const o = r.prosjekDanas ? Math.round((r.sada / r.prosjekDanas - 1) * 100) : 0;
      return Math.abs(o) <= 3 ? 'Ova je sezona po toplini bila prosječna.' : 'Ova je sezona bila ' + Math.abs(o) + ' % ' + (o > 0 ? 'toplija' : 'hladnija') +
        ' od prosjeka (zbroj od početka sezone). Rast je sada spor, pa se usporedba u danima ne računa.';
    }
    const p = Math.abs(r.pomak);
    let t;
    if (p <= 2) t = 'Sezona teče kao u prosječnoj godini.';
    else if (r.pomak > 0) t = 'Sezona je oko ' + p + ' dana ispred prosječne godine – razvoj usjeva, cvatnja i zrioba dolaze ranije.';
    else t = 'Sezona kasni oko ' + p + ' dana za prosječnom godinom – razvoj je sporiji, rokovi se pomiču kasnije.';
    if (r.pomak > 5 && ['kukuruz', 'soja', 'suncokret'].includes(kultura)) t += ' Kritično razdoblje za vodu (cvatnja) moglo bi pasti ranije nego inače – pratite bilancu vode.';
    if (r.pomak > 5 && ['vocnjak', 'loza'].includes(kultura)) t += ' Raniji razvoj znači i veći rizik od kasnog mraza.';
    if (r.pomak > 5 && ['psenica', 'repica'].includes(kultura)) t += ' Ozimi usjevi ranije kreću – prihranu planirajte ranije.';
    return t;
  }

  function prikaziGDD(kultura) {
    const okvir = el('div', { class: 'gdd' }, el('div', { class: 'agro-naslov' }, 'Toplinske jedinice (GDD)'), el('p', { class: 'sitno-siva' }, 'Učitavam višegodišnji prosjek…'));
    (async () => {
      try {
        const dani = await dohvatiArhivu();
        const r = izracunGDD(dani, kultura);
        if (r.prije) { okvir.replaceChildren(el('div', { class: 'agro-naslov' }, 'Toplinske jedinice (GDD)'), el('p', {}, opisGDD(r, kultura))); return; }
        const omjer = r.prosjekDanas ? Math.round((r.sada / r.prosjekDanas - 1) * 100) : 0;
        okvir.replaceChildren(
          el('div', { class: 'agro-naslov' }, 'Toplinske jedinice (GDD) – ' + r.c.naziv),
          el('div', { class: 'gdd-brojke' },
            el('div', {}, el('strong', {}, Math.round(r.sada) + ' °C·dan'), el('span', {}, 'ove godine')),
            el('div', {}, el('strong', {}, Math.round(r.prosjekDanas) + ' °C·dan'), el('span', {}, 'prosjek 1995.–2024.')),
            el('div', {}, el('strong', {}, (omjer >= 0 ? '+' : '') + omjer + ' %'), el('span', {}, 'razlika')),
            el('div', {}, el('strong', {}, '+' + Math.round(r.zaTjedan)), el('span', {}, 'sljedećih 7 dana'))),
          grafGDD(r),
          el('div', { class: 'gdd-legenda' }, el('span', { class: 'l-tekuca' }, 'ova godina'), el('span', { class: 'l-prognoza' }, 'prognoza'), el('span', { class: 'l-prosjek' }, 'prosjek')),
          el('p', {}, opisGDD(r, kultura)));
      } catch (g) {
        okvir.replaceChildren(el('div', { class: 'agro-naslov' }, 'Toplinske jedinice (GDD)'), el('p', { class: 'sitno-siva' }, 'Višegodišnji podaci trenutno nisu dostupni.'));
      }
    })();
    return okvir;
  }

  function prikaziSavjete() {
    let kultura = 'opce';
    try { kultura = localStorage.getItem('webgis.kultura') || 'opce'; } catch (g) { /* nije bitno */ }
    const x = agroPokazatelji();
    const popis = el('div', { class: 'savjeti' });
    const gddMjesto = el('div');
    const crtaj = () => {
      popis.replaceChildren(...savjetiZaKulturu(kultura, x).map(([r, n, o]) => el('div', { class: 'savjet ' + r },
        el('span', { class: 'savjet-oznaka' }, { upozorenje: '!', oprez: '•', dobro: '✓', info: 'i' }[r]),
        el('div', {}, el('strong', {}, n), el('p', {}, o)))));
      gddMjesto.replaceChildren(prikaziGDD(kultura));
    };
    const odabir = el('select', { 'aria-label': 'Kultura', onchange: (e) => { kultura = e.target.value; try { localStorage.setItem('webgis.kultura', kultura); } catch (g) { /* */ } crtaj(); } },
      ...Object.entries(KULTURE).map(([k, n]) => el('option', { value: k, selected: k === kultura }, n)));
    crtaj();
    return el('div', { class: 'agro-savjeti' },
      el('div', { class: 'savjeti-zaglavlje' }, el('div', { class: 'agro-naslov' }, 'Što to znači za vaše radove'), odabir),
      popis, gddMjesto,
      el('p', { class: 'sitno-siva' }, 'Savjeti su opći, izvedeni iz prognoze i uobičajenih agrotehničkih rokova za istočnu Hrvatsku. Za zaštitu bilja vrijede upute na etiketi sredstva i preporuke savjetodavne službe.'));
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
      prikaziSavjete(),
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
