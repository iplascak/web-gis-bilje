#!/usr/bin/env python3
"""Dopuna prijevoda (EN, HU): nazivi slojeva za mađarski, podgrupe, legende, polja u skočnim prozorima.
Pokreni jednom: python3 scripts/prijevodi_dodatak.py  -> upisuje u config/prijevodi/en.json i hu.json."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prijevodi_vrijeme import T as T_VR, U as U_VR, DANI
from prijevodi_satelit import T as T_SAT, U as U_SAT
from prijevodi_ostalo import T as T_OST, U as U_OST

HU_SLOJEVI = {
 'dalekovodi': ['Távvezetékek', 'Nagyfeszültségű távvezetékek nyomvonala.'],
 'plinovod': ['Fő gázvezeték', 'A fő gázvezeték nyomvonala.'],
 'groblja': ['Temetők', 'A temetőkről készült drónfelvételek kiterjedése.'],
 'groblja_dron': ['Temetők – drónfelvétel (5 cm)', 'Részletes drónfelvétel a temetőkről, nagyításkor látható.'],
 'grobna_mjesta_prijedlog': ['Sírhelyek – automatikus körvonal', 'Drónfelvételekről automatikusan felismert sírkörvonalak – munkaváltozat.'],
 'projekti': ['Fejlesztési projektek (Stratégia 2030)', 'A község 2030-ig szóló stratégiájának fejlesztési projektjei.'],
 'gradevinska_podrucja': ['Építési területek (rendezési terv, 2017)', 'Építési területek a 2017-es rendezési terv szerint – nem aktuális.'],
 'osjetljivost_solar': ['Természeti érzékenység – napelemparkok', 'Hol zavarnák a legkevésbé a természetet a napelemparkok.'],
 'osjetljivost_vjetar': ['Természeti érzékenység – szélerőművek', 'Természeti érzékenység szélerőművek esetén (madarak, denevérek, élőhelyek).'],
 'pogodnost_solar': ['Műszaki alkalmasság napelemparkokhoz', 'A terület műszaki alkalmassága napelemparkok számára.'],
 'corine_2018': ['CORINE felszínborítás 2018', 'Európai felszínborítási térkép, 2018.'],
 'corine_1980': ['CORINE felszínborítás 1980', 'Felszínborítás 1980-ban – a csúszkás összehasonlítóval vesse össze a 2018-assal.'],
 'corine_promjene': ['CORINE változások 2012–2018', 'Ahol a felszínborítás 2012 és 2018 között megváltozott.'],
 'izgradenost_promjena': ['Beépítettség változása 2021–2024', 'Új beépített területek a Copernicus műholdadatai alapján.'],
 'bonitet': ['Talaj minőségi osztálya', 'A mezőgazdasági földek értéke (rendezési terv szerinti osztályok).'],
 'pedoloska_karta': ['Talajtérkép', 'Talajtípusok az alap talajtérkép szerint.'],
 'struktura_parcela': ['Mezőgazdasági parcellaszerkezet', 'Nagy, felaprózott és szabálytalan parcellák.'],
 'paprika_pogodnost': ['Alkalmasság fűszerpaprikára', 'Hol a legjobbak a feltételek a fűszerpaprika termesztéséhez.'],
 'tlo_org_ugljik': ['Talaj szervesszén-tartalma (0–30 cm)', 'Szerves szén a feltalajban – a talaj egészségének mutatója.'],
 'tlo_dusik': ['Talaj összes nitrogéntartalma (0–10 cm)', 'Összes nitrogén a feltalajban (2016-os monitoring).'],
 'tlo_cn': ['Talaj C/N aránya (0–30 cm)', 'A szén és a nitrogén aránya.'],
 'poplave_vv': ['Árvíz – nagy valószínűség', 'Gyakran elöntött területek; a szín a vízmélységet jelzi.'],
 'poplave_mv': ['Árvíz – kis valószínűség', 'Ritka, szélsőséges árvizek; a szín a vízmélységet jelzi.'],
 'hidro_postaje': ['Vízmérce-állomások', 'Vízállásmérő állomások a Dráván és a Dunán.'],
 'vodotoci_kanali': ['Csatornák és patakok', 'Lecsapoló csatornák, patakok és árkok.'],
 'jezera_bare': ['Tavak, holtágak és folyami szigetek', 'Tavak (Kopácsi-tó, Szakadás), holtágak és folyami szigetek.'],
 'sanitarna_zastita': ['Ivóvízbázis-védőövezetek', 'Az ivóvízforrások védőövezetei.'],
 'kupalista': ['Fürdőhelyek', 'Hivatalos szabadvízi fürdőhelyek a környéken.'],
 'prepreke_vodotoci': ['Akadályok a vízfolyásokon', 'Zsilipek, szivattyútelepek, sarkantyúk és bukók.'],
 'stanista': ['Élőhelytérkép', 'Élőhelytípusok (nemzeti osztályozás).'],
 'stanista_2016': ['Nem erdei élőhelyek 2016', 'Hivatalos élőhelytérkép, 2016.'],
 'sume': ['Erdők', 'Erdők rendeltetés és tulajdon szerint.'],
 'lovista': ['Vadászterületek', 'Vadászterületek határai – hasznos a túrázóknak vadászidényben.'],
 'ciprinidne_vode': ['Horgászvizek', 'Duna és Dráva – pontyfélék vizei.'],
 'pokrov_zemljista': ['Felszínborítás', 'Települések, szántók, erdők, vizes élőhelyek és vizek.'],
 'upravljacke_zone': ['Védett területek kezelési zónái', 'Zónák a védett területek kezelési terveiből.'],
 'obnova_prirode': ['Természet-helyreállítási javaslatok', 'Természet-helyreállításra javasolt területek és intézkedések.'],
 'bastina_registar': ['Kulturális örökség (nyilvántartás)', 'Védett kulturális örökségi területek: a tikvesi kastély, Zlatna Greda.'],
 'krajobraz': ['Tájegységek', 'A község tájegységei.'],
 'vizure': ['Kilátások', 'A kilátópontokról nyíló kilátás minősége.'],
 'tocke_gledista': ['Kilátópontok', 'Pontok, ahonnan a kilátást értékelték.'],
 'osjetljivost_krajobraza': ['Táji érzékenység', 'Mennyire érzékeny a táj az új beépítésre.'],
 'plovni_put': ['Hajóút (Duna, Dráva)', 'Nemzetközi folyami hajóutak.'],
 'mobilno_reciklazno': ['Mobil hulladékudvar', 'Hol és mikor érkezik a mobil hulladékudvar.'],
 'komunalni_objekti': ['Utcabútorok és közvilágítás', 'Lámpák, padok, kukák, játszótéri eszközök, defibrillátorok.'],
}

# hr: (en, hu)
T = {
 # podgrupe
 'Slobodno vrijeme': ('Leisure', 'Szabadidő'), 'Imovina i infrastruktura': ('Property and infrastructure', 'Vagyon és infrastruktúra'),
 'Energetska mreža': ('Energy network', 'Energiahálózat'), 'Groblja': ('Cemeteries', 'Temetők'),
 'Pogodnost za kulture': ('Crop suitability', 'Növénytermesztési alkalmasság'), 'Opasnost od poplava': ('Flood hazard', 'Árvízveszély'),
 'Obrana od poplava': ('Flood defence', 'Árvízvédelem'), 'Vodotoci i kanali': ('Watercourses and canals', 'Vízfolyások és csatornák'),
 'Voda za ljude': ('Drinking water', 'Ivóvíz'), 'Lov i ribolov': ('Hunting and fishing', 'Vadászat és horgászat'),
 'Kulturna baština': ('Cultural heritage', 'Kulturális örökség'), 'Krajobraz i vidikovci': ('Landscape and viewpoints', 'Táj és kilátópontok'),
 'Topografska': ('Topographic', 'Topográfiai'), 'Pokrov zemljišta': ('Land cover', 'Felszínborítás'),
 'Obnovljivi izvori energije': ('Renewable energy', 'Megújuló energia'), 'Sjećanja mještana': ("Residents' memories", 'Helyi emlékek'),
 'Komunalna oprema': ('Street furniture', 'Utcabútorok'), 'Izvor': ('Source', 'Forrás'), 'Ažurirano': ('Updated', 'Frissítve'),
 # ustanove i javni sadržaji
 'Općina Bilje': ('Bilje Municipality', 'Bellye község'), 'Komunalno - Bilje d.o.o.': ('Komunalno - Bilje (utility company)', 'Komunalno - Bilje (közműcég)'),
 'Dječji vrtić': ('Kindergarten', 'Óvoda'), 'Kultura': ('Culture', 'Kultúra'), 'Turistička zajednica': ('Tourist board', 'Turisztikai iroda'),
 'Zdravlje (ljekarna, ambulanta, AED)': ('Health (pharmacy, clinic, AED)', 'Egészség (gyógyszertár, rendelő, AED)'),
 'Vrtić, škola, knjižnica': ('Kindergarten, school, library', 'Óvoda, iskola, könyvtár'),
 'Pošta, banke, gorivo, punionice': ('Post, banks, fuel, EV charging', 'Posta, bankok, üzemanyag, töltőállomások'),
 'Trgovine': ('Shops', 'Üzletek'), 'Dječja igrališta': ('Playgrounds', 'Játszóterek'), 'Sport': ('Sport', 'Sport'),
 'Reciklaža i pitka voda': ('Recycling and drinking water', 'Szelektív gyűjtés és ivóvíz'), 'Vatrogasci i policija': ('Fire brigade and police', 'Tűzoltóság és rendőrség'),
 'Crkve': ('Churches', 'Templomok'), 'Restorani i kafići': ('Restaurants and cafés', 'Éttermek és kávézók'), 'Smještaj': ('Accommodation', 'Szállás'),
 'Vidikovci i priroda': ('Viewpoints and nature', 'Kilátók és természet'), 'Parkovi, izletišta, WC': ('Parks, picnic sites, toilets', 'Parkok, kirándulóhelyek, WC'),
 'Znamenitosti': ('Sights', 'Látnivalók'), 'pristupačno': ('accessible', 'akadálymentes'), 'djelomično pristupačno': ('partly accessible', 'részben akadálymentes'),
 'nije pristupačno': ('not accessible', 'nem akadálymentes'), 'nije provjereno': ('not checked', 'nincs ellenőrizve'),
 # imovina
 'Društveni domovi, vrtići, kultura': ('Community halls, kindergartens, culture', 'Kultúrházak, óvodák, kultúra'),
 'Stanovi i kuće za najam': ('Flats and houses for rent', 'Bérlakások és -házak'), 'Poslovni prostori': ('Business premises', 'Üzlethelyiségek'),
 'Neizgrađeno građevinsko zemljište': ('Undeveloped building land', 'Beépítetlen építési telek'), 'Poljoprivredno zemljište': ('Agricultural land', 'Mezőgazdasági föld'),
 'Ostalo': ('Other', 'Egyéb'), 'ostalo': ('other', 'egyéb'), 'Nerazvrstane ceste': ('Local roads', 'Helyi utak'),
 'Javna rasvjeta (čestice)': ('Street lighting (parcels)', 'Közvilágítás (telkek)'), 'Javne zelene površine': ('Public green areas', 'Közterületi zöldfelületek'),
 'Građevine i uređaji javne namjene': ('Public buildings and facilities', 'Középületek és közcélú létesítmények'), 'Javna parkirališta': ('Public car parks', 'Közparkolók'),
 'Pješačke i druge javne prometne površine': ('Pedestrian and other public areas', 'Gyalogos és egyéb közlekedési közterületek'),
 # projekti
 'Završen': ('Completed', 'Befejezett'), 'U provedbi (2021.)': ('In progress (2021)', 'Megvalósítás alatt (2021)'),
 'EU projekt (bilje.hr)': ('EU project (bilje.hr)', 'EU-projekt (bilje.hr)'), 'Visoka spremnost': ('High readiness', 'Magas készültség'),
 'Srednja spremnost': ('Medium readiness', 'Közepes készültség'), 'Niska spremnost / planiranje': ('Low readiness / planning', 'Alacsony készültség / tervezés'),
 'provedeno': ('completed', 'megvalósult'), 'u provedbi': ('in progress', 'megvalósítás alatt'), 'u pripremi': ('in preparation', 'előkészítés alatt'),
 'planirano': ('planned', 'tervezett'), 'Razdoblje': ('Period', 'Időszak'), 'Vrijednost': ('Value', 'Érték'),
 'Bespovratna sredstva': ('Grant funding', 'Vissza nem térítendő támogatás'), 'Izvor financiranja': ('Funding source', 'Finanszírozási forrás'),
 'Program / natječaj': ('Programme / call', 'Program / pályázat'), 'Nositelj': ('Lead organisation', 'Kedvezményezett'), 'Više': ('More', 'Bővebben'),
 # prostor
 'Naselje – izgrađeni dio': ('Settlement – built-up part', 'Település – beépített rész'), 'Naselje – neizgrađeni dio': ('Settlement – undeveloped part', 'Település – beépítetlen rész'),
 'Ugostiteljsko-turistička namjena': ('Hospitality and tourism', 'Vendéglátás és turizmus'), 'Gospodarska namjena': ('Business use', 'Gazdasági rendeltetés'),
 'Sport i rekreacija': ('Sport and recreation', 'Sport és rekreáció'), 'Posebni uvjeti (PPPP Kopački rit)': ('Special conditions (Kopački rit spatial plan)', 'Különleges feltételek (Kopácsi-rét terv)'),
 'Groblje': ('Cemetery', 'Temető'), 'Ostalo (mineralne sirovine, reciklažno dvorište)': ('Other (minerals, recycling yard)', 'Egyéb (ásványi nyersanyag, hulladékudvar)'),
 'iznimno osjetljivo': ('extremely sensitive', 'rendkívül érzékeny'), 'vrlo osjetljivo': ('very sensitive', 'nagyon érzékeny'),
 'umjereno osjetljivo': ('moderately sensitive', 'mérsékelten érzékeny'), 'vrlo malo osjetljivo': ('slightly sensitive', 'alig érzékeny'),
 'izgrađene površine': ('built-up areas', 'beépített területek'), 'šume i prijelazna područja': ('forests and transitional areas', 'erdők és átmeneti területek'),
 'močvare': ('wetlands', 'mocsarak'),
 # tlo i poljoprivreda
 'P1 – osobito vrijedno obradivo tlo': ('P1 – exceptionally valuable arable land', 'P1 – kiemelten értékes szántóföld'),
 'P2 – vrijedno obradivo tlo': ('P2 – valuable arable land', 'P2 – értékes szántóföld'),
 'PŠ – ostala poljoprivredna i šumska tla': ('PŠ – other agricultural and forest land', 'PŠ – egyéb mezőgazdasági és erdőtalaj'),
 'vode': ('water', 'vizek'), 'izgrađeno': ('built-up', 'beépített'), 'A – aluvijalno tlo': ('A – alluvial soil', 'A – öntéstalaj'),
 'hipoglej, amfiglej, ritska crnica': ('hypogley, amphigley, marsh black soil', 'hipoglej, amfiglej, réti feketeföld'),
 'amfiglej, hipoglej': ('amphigley, hypogley', 'amfiglej, hipoglej'), 'hipoglej, amfiglej': ('hypogley, amphigley', 'hipoglej, amfiglej'),
 'GY (oznaka OPK)': ('GY (soil map code)', 'GY (talajtérképi jel)'), 'L – RI (oznaka OPK)': ('L – RI (soil map code)', 'L – RI (talajtérképi jel)'),
 'HM – humoglej': ('HM – humogley', 'HM – humuszos glejtalaj'), 'L – ES (oznaka OPK)': ('L – ES (soil map code)', 'L – ES (talajtérképi jel)'),
 'oranica': ('arable land', 'szántó'), 'livada': ('meadow', 'rét'), 'pašnjak': ('pasture', 'legelő'), 'voćnjak': ('orchard', 'gyümölcsös'),
 'mješoviti trajni nasadi': ('mixed permanent crops', 'vegyes ültetvények'), 'staklenik na oranici': ('greenhouse on arable land', 'üvegház szántón'),
 'privremeno neodržavano': ('temporarily unmaintained', 'átmenetileg műveletlen'), 'ostale trajne kulture': ('other permanent crops', 'egyéb ültetvények'),
 'vinograd': ('vineyard', 'szőlő'), 'rasadnik': ('nursery', 'faiskola'), 'brzorastući panjači': ('short-rotation coppice', 'rövid vágásfordulójú energiaerdő'),
 'velike pravilne parcele': ('large regular parcels', 'nagy, szabályos parcellák'), 'usitnjene pravilne parcele': ('small regular parcels', 'felaprózott, szabályos parcellák'),
 'velike nepravilne parcele': ('large irregular parcels', 'nagy, szabálytalan parcellák'),
 'vrlo pogodno': ('very suitable', 'nagyon alkalmas'), 'pogodno': ('suitable', 'alkalmas'), 'umjereno pogodno': ('moderately suitable', 'mérsékelten alkalmas'),
 'slabo pogodno': ('poorly suitable', 'kevéssé alkalmas'), 'Uporaba (ARKOD 2023.)': ('Land use (ARKOD 2023)', 'Földhasználat (ARKOD 2023)'),
 'Površina (ha)': ('Area (ha)', 'Terület (ha)'), 'NDVI ': ('NDVI ', 'NDVI '), 'NDVI uobičajeno': ('Usual NDVI', 'Szokásos NDVI'),
 'Odstupanje': ('Deviation', 'Eltérés'), 'ARKOD ID': ('ARKOD ID', 'ARKOD-azonosító'),
 'znatno slabije nego obično': ('much weaker than usual', 'a szokásosnál jóval gyengébb'), 'nešto slabije': ('slightly weaker', 'kissé gyengébb'),
 'uobičajeno': ('as usual', 'szokásos'), 'bujnije nego obično': ('lusher than usual', 'a szokásosnál dúsabb'), 'golo tlo / mirovanje': ('bare soil / dormant', 'csupasz talaj / nyugalmi állapot'),
 'nema usporedbe': ('no comparison', 'nincs összehasonlítás'), 'nema čiste snimke': ('no clear image', 'nincs felhőmentes felvétel'),
 'Zadnja čista snimka': ('Last clear image', 'Utolsó felhőmentes felvétel'), 'Uspoređuje se': ('Compared', 'Összehasonlítás'),
 'Bujnost (NDVI)': ('Vigour (NDVI)', 'Növényzet dússága (NDVI)'), 'Uobičajeno': ('Usual', 'Szokásos'),
 'ozima kultura (pšenica, ječam, repica)': ('winter crop (wheat, barley, rapeseed)', 'őszi vetés (búza, árpa, repce)'),
 'suncokret (vjerojatno)': ('sunflower (likely)', 'napraforgó (valószínűleg)'), 'kukuruz ili soja': ('maize or soybean', 'kukorica vagy szója'),
 'šećerna repa (vjerojatno)': ('sugar beet (likely)', 'cukorrépa (valószínűleg)'), 'travnjak, djetelina, lucerna': ('grassland, clover, alfalfa', 'gyep, lóhere, lucerna'),
 'trajni nasad': ('permanent crop', 'ültetvény'), 'ostalo / mješovito': ('other / mixed', 'egyéb / vegyes'), 'bez razvijenog usjeva': ('no developed crop', 'nincs fejlett növényzet'),
 'slabiji dio parcele (< 90 % prosjeka parcele)': ('weaker part of the parcel (< 90 % of the parcel average)', 'gyengébb parcellarész (< a parcellaátlag 90 %-a)'),
 'prosječno': ('average', 'átlagos'), 'jači dio parcele (> 110 %)': ('stronger part of the parcel (> 110 %)', 'erősebb parcellarész (> 110 %)'),
 'nema dovoljno podataka': ('not enough data', 'nincs elég adat'),
 # vode
 'kanal, stalna voda': ('canal, permanent water', 'csatorna, állandó víz'), 'kanal, povremena voda': ('canal, intermittent water', 'csatorna, időszakos víz'),
 'potok': ('stream', 'patak'), 'jaruga, povremeni tok': ('gully, intermittent flow', 'vízmosás, időszakos vízfolyás'), 'rijeka': ('river', 'folyó'),
 'I. zona': ('Zone I', 'I. zóna'), 'II. zona': ('Zone II', 'II. zóna'), 'III. zona': ('Zone III', 'III. zóna'),
 # priroda
 'park prirode': ('nature park', 'természetpark'), 'posebni rezervat': ('special reserve', 'különleges rezervátum'), 'regionalni park': ('regional park', 'regionális park'),
 'spomenik prirode': ('natural monument', 'természeti emlék'), 'spomenik parkovne arhitekture': ('monument of park architecture', 'kertépítészeti emlék'),
 'značajni krajobraz': ('significant landscape', 'jelentős táj'), 'vode i močvare': ('water and wetlands', 'vizek és mocsarak'),
 'travnjaci i vlažne livade': ('grassland and wet meadows', 'gyepek és nedves rétek'), 'šikare i živice': ('scrub and hedges', 'cserjések és sövények'),
 'šume': ('forests', 'erdők'), 'poljoprivredne površine': ('agricultural land', 'mezőgazdasági területek'), 'naselja': ('settlements', 'települések'),
 'šume posebne namjene': ('special-purpose forests', 'különleges rendeltetésű erdők'), 'gospodarske šume': ('commercial forests', 'gazdasági erdők'),
 'područje jezgre': ('core area', 'magterület'), 'zaštitna zona': ('buffer zone', 'pufferzóna'), 'prijelazno područje': ('transition area', 'átmeneti terület'),
 'A – površinske vode i močvare': ('A – surface waters and wetlands', 'A – felszíni vizek és mocsarak'), 'B – neobrasle površine': ('B – bare areas', 'B – növényzet nélküli felszínek'),
 'C – travnjaci, cretovi': ('C – grasslands, fens', 'C – gyepek, lápok'), 'D – šikare': ('D – scrub', 'D – cserjések'), 'E – šume': ('E – forests', 'E – erdők'),
 'I – kultivirane površine': ('I – cultivated land', 'I – művelt területek'), 'J – izgrađena staništa': ('J – built-up habitats', 'J – beépített élőhelyek'),
 'obnova staništa': ('habitat restoration', 'élőhely-helyreállítás'), 'obnova za vrste': ('restoration for species', 'helyreállítás fajok számára'),
 'povezanost rijeka': ('river connectivity', 'folyók átjárhatósága'), 'atrakcija': ('attraction', 'látványosság'), 'info centar': ('information centre', 'információs központ'),
 'poučna ploča': ('information board', 'ismertető tábla'), 'promatranje životinja': ('wildlife watching', 'állatmegfigyelés'), 'ribolov': ('fishing', 'horgászat'),
 'ugostiteljstvo i smještaj': ('food and accommodation', 'vendéglátás és szállás'), 'biciklistička staza': ('cycle route', 'kerékpárút'),
 'šetnica': ('walkway', 'sétány'), 'poučna staza': ('educational trail', 'tanösvény'), 'ribolovna voda': ('fishing water', 'horgászvíz'),
 # baština i krajobraz
 'Graditeljska baština': ('Built heritage', 'Épített örökség'), 'Arheološki lokalitet': ('Archaeological site', 'Régészeti lelőhely'),
 'Plato Brestovac – poljoprivredne površine': ('Brestovac plateau – farmland', 'Brestováci fennsík – mezőgazdasági területek'),
 'Naselja sa sitnijom parcelacijom': ('Settlements with small plots', 'Aprótelkes települések'), 'Niža meliorirana područja Baranje': ('Lower drained areas of Baranja', 'Baranya alacsonyabb, meliorált területei'),
 'Doprirodno područje uz Dravu': ('Near-natural area along the Drava', 'Természetközeli terület a Dráva mentén'), 'Kopački rit': ('Kopački rit', 'Kopácsi-rét'),
 'Odlična vizura': ('Excellent view', 'Kiváló kilátás'), 'Srednje dobra vizura': ('Fairly good view', 'Közepesen jó kilátás'), 'Loša vizura': ('Poor view', 'Gyenge kilátás'),
 'polja, rudine, pašnjaci': ('fields, meadows, pastures', 'szántók, rétek, legelők'), 'bare, rukavci, kanali': ('ponds, backwaters, canals', 'tavak, holtágak, csatornák'),
 'objekti (škole, crkve, mostovi…)': ('buildings (schools, churches, bridges…)', 'épületek (iskolák, templomok, hidak…)'),
 'stara fotografija': ('old photo', 'régi fénykép'), 'narodni naziv mjesta (toponim)': ('local place name', 'népi helynév'),
 'priča / sjećanje': ('story / memory', 'történet / emlék'), 'Ustupio/la': ('Shared by', 'Beküldte'),
 # događanja i komunalni objekti
 'manifestacija': ('festival / event', 'rendezvény'), 'kultura': ('culture', 'kultúra'), 'sport': ('sport', 'sport'), 'turizam i izleti': ('tourism and trips', 'turizmus és kirándulás'),
 'edukacija, radionice': ('education, workshops', 'oktatás, műhelyek'), 'sajam, tržnica': ('fair, market', 'vásár, piac'), 'vjerski događaj': ('religious event', 'egyházi esemény'),
 'radovi / zatvorena cesta': ('works / road closed', 'munkálatok / útlezárás'), 'svjetiljka javne rasvjete': ('street light', 'közvilágítási lámpa'), 'klupa': ('bench', 'pad'),
 'koš za otpad': ('litter bin', 'szemetes'), 'igralo': ('playground equipment', 'játszótéri eszköz'), 'hidrant': ('hydrant', 'tűzcsap'), 'prometni znak': ('traffic sign', 'közlekedési tábla'),
 'autobusno stajalište': ('bus stop', 'buszmegálló'), 'zeleni otok': ('recycling point', 'szelektív hulladékgyűjtő sziget'), 'defibrilator (AED)': ('defibrillator (AED)', 'defibrillátor (AED)'),
 'javna slavina': ('public tap', 'közkút'), 'punionica za e-vozila': ('EV charging point', 'elektromosautó-töltő'),
 'Mjesto': ('Place', 'Helyszín'), 'Organizator': ('Organiser', 'Szervező'), 'Vrsta': ('Type', 'Típus'), 'Ulica': ('Street', 'Utca'), 'Stanje': ('Condition', 'Állapot'),
 'Napomena': ('Note', 'Megjegyzés'), 'Naselje': ('Settlement', 'Település'), 'Termini 2026.': ('Dates 2026', 'Időpontok 2026'), 'Vrijeme': ('Weather', 'Időjárás'), 'Vrijeme dolaska': ('Arrival time', 'Érkezés ideje'),
 # otpad
 'Bilje I – ponedjeljak': ('Bilje I – Monday', 'Bilje I – hétfő'), 'Bilje II – utorak': ('Bilje II – Tuesday', 'Bilje II – kedd'),
 'Vardarac, Lug, Kopačevo, Kozjak, Zlatna Greda – srijeda': ('Vardarac, Lug, Kopačevo, Kozjak, Zlatna Greda – Wednesday', 'Vardarac, Lug, Kopačevo, Kozjak, Zlatna Greda – szerda'),
 'nije navedeno u rasporedu': ('not in the schedule', 'nem szerepel a beosztásban'),
 # prijave
 'zaprimljeno': ('received', 'beérkezett'), 'u obradi': ('in progress', 'folyamatban'), 'riješeno': ('resolved', 'megoldva'),
 'nije u nadležnosti / odbijeno': ('not our responsibility / rejected', 'nem hatáskörünk / elutasítva'), 'Opis': ('Description', 'Leírás'), 'Lokacija': ('Location', 'Helyszín'),
 'Status': ('Status', 'Állapot'), 'Odgovor općine': ('Municipality reply', 'A község válasza'), 'Prijavljeno': ('Reported', 'Bejelentve'),
 'Zadnja promjena': ('Last change', 'Utolsó változás'), 'Broj prijave': ('Report number', 'Bejelentés száma'),
 # zrak
 'nema podataka': ('no data', 'nincs adat'), 'Kvaliteta zraka': ('Air quality', 'Levegőminőség'), 'Mjereno': ('Measured', 'Mérve'),
}

T.update({'Bilješke na karti (podijeli poveznicom)': ('Notes on the map (share by link)', 'Jegyzetek a térképen (megosztás linkkel)'), 'Bonitet tla, parcele, kanali i prognoza za poljoprivrednike': ('Soil value, parcels, canals and the farm forecast', 'Talajminőség, parcellák, csatornák és agrár-előrejelzés'), 'Godišnje izvješće iz podataka (za vijeće i mještane)': ('Annual report from the data (for the council and residents)', 'Éves jelentés az adatokból (a képviselő-testületnek és a lakosoknak)'), 'Isključi': ('Turn off', 'Kikapcsolás'), 'Izmjeri površinu': ('Measure area', 'Terület mérése'), 'Izmjeri duljinu': ('Measure distance', 'Távolság mérése'), 'Jačina podloge': ('Basemap intensity', 'Alaptérkép erőssége'), 'Karta (OpenStreetMap)': ('Map (OpenStreetMap)', 'Térkép (OpenStreetMap)'), 'Katastar, građevinska područja, opasnost od poplava i zaštićena priroda': ('Cadastre, building zones, flood hazard and protected nature', 'Kataszter, építési területek, árvízveszély és védett természet'), 'Kliknite pa odaberite mjesto na karti (ili desni klik / dugi pritisak bilo gdje)': ('Click, then choose a place on the map (or right-click / long-press anywhere)', 'Kattintson, majd válasszon helyet a térképen (vagy jobb klikk / hosszú érintés bárhol)'), 'Kopiraj poveznicu na ovaj prikaz': ('Copy a link to this view', 'Hivatkozás másolása erre a nézetre'), 'Kratke upute za korištenje': ('Quick guide', 'Rövid útmutató'), 'Nadolazeća događanja': ('Upcoming events', 'Közelgő események'), 'Opasnost od poplava, nasipi i vodostaji': ('Flood hazard, embankments and water levels', 'Árvízveszély, gátak és vízállások'), 'Općina Bilje – službena stranica': ('Bilje Municipality – official website', 'Bellye község – hivatalos honlap'), 'Službena stranica Općine Bilje': ('Official website of Bilje Municipality', 'Bellye község hivatalos honlapja'), 'Ortofoto 2021. (DGU) – cijela općina': ('Orthophoto 2021 (DGU) – whole municipality', 'Ortofotó 2021 (DGU) – az egész község'), 'Ortofoto 2023. (DGU) – samo zapadni dio': ('Orthophoto 2023 (DGU) – western part only', 'Ortofotó 2023 (DGU) – csak a nyugati rész'), 'Topografska karta TK25 (DGU)': ('Topographic map TK25 (DGU)', 'TK25 topográfiai térkép (DGU)'), 'Bez podloge': ('No basemap', 'Alaptérkép nélkül'), 'Ortofoto 2021.': ('Orthophoto 2021', 'Ortofotó 2021'), 'Ortofoto 2023.': ('Orthophoto 2023', 'Ortofotó 2023'), 'Ortofoto naselja snimljen dronom 2020. godine (DOF_BILJE_light); pokriva izgrađena područja naselja i lijepi se preko odabrane podloge.': ('Drone orthophoto of the villages from 2020 (DOF_BILJE_light); covers built-up areas and is overlaid on the chosen basemap.', 'A települések 2020-as drónos ortofotója (DOF_BILJE_light); a beépített területeket fedi, és a kiválasztott alaptérkép fölé kerül.'), 'Snimka naselja dronom 2020. (Općina Bilje)': ('Drone image of the villages 2020 (Bilje Municipality)', 'Drónfelvétel a településekről 2020 (Bellye község)'), 'Portal je informativnog karaktera i nema pravnu snagu. Za službene podatke (katastar, prostorni planovi) obratite se nadležnim tijelima ili Jedinstvenom upravnom odjelu Općine Bilje. Portal je izrađen volonterski, isključivo s besplatnim alatima otvorenog koda.': ('The portal is for information only and has no legal force. For official data (cadastre, spatial plans) contact the competent authorities or the administrative department of Bilje Municipality. The portal was built voluntarily, using only free open-source tools.', 'A portál tájékoztató jellegű, jogi ereje nincs. Hivatalos adatokért (kataszter, rendezési tervek) forduljon az illetékes hatóságokhoz vagy Bellye község hivatalához. A portál önkéntes munkával, kizárólag ingyenes, nyílt forráskódú eszközökkel készült.'), 'Povucite za promjenu redoslijeda': ('Drag to change the order', 'Húzza a sorrend módosításához'), 'Preuzmi podatke sloja (GeoJSON za GIS, CSV za Excel)': ('Download layer data (GeoJSON for GIS, CSV for Excel)', 'Rétegadatok letöltése (GeoJSON GIS-hez, CSV Excelhez)'), 'Prijava na portal i moje prijave': ('Sign in and my reports', 'Belépés és bejelentéseim'), 'Prijave mještana, komunalna infrastruktura i imovina općine': ("Residents' reports, municipal infrastructure and property", 'Lakossági bejelentések, közművek és községi vagyon'), 'Prijavite komunalni problem općini': ('Report a local problem to the municipality', 'Jelentsen be kommunális problémát a községnek'), 'Prikaži cijelu općinu': ('Show the whole municipality', 'Az egész község megjelenítése'), 'Prikaži ili sakrij slojeve': ('Show or hide layers', 'Rétegek megjelenítése vagy elrejtése'), 'Pronađi sloj': ('Find a layer', 'Réteg keresése'), 'Pronađite grobno mjesto po imenu i prezimenu': ('Find a grave by first name and surname', 'Sírhely keresése név alapján'), 'Razvojni projekti općine': ('Municipal development projects', 'A község fejlesztési projektjei'), 'Slojevi i legenda': ('Layers and legend', 'Rétegek és jelmagyarázat'), 'Uključeni slojevi': ('Active layers', 'Bekapcsolt rétegek'), 'Usporedi snimke (klizač)': ('Compare images (swipe)', 'Felvételek összehasonlítása (csúszka)'), 'Važeća prostorno-planska dokumentacija': ('Valid spatial planning documents', 'Hatályos területrendezési dokumentumok'), 'Više o sloju': ('More about the layer', 'Bővebben a rétegről'), 'Vođena priča kroz karte': ('Guided story through maps', 'Vezetett történet térképeken'), 'Zaštita osobnih podataka': ('Personal data protection', 'Személyes adatok védelme'), 'Zaštićena područja, vidikovci, kupališta, baština i autobus': ('Protected areas, viewpoints, bathing sites, heritage and bus', 'Védett területek, kilátók, fürdőhelyek, örökség és busz'), 'Suša 2026. – karta odstupanja': ('Drought 2026 – deviation map', 'Aszály 2026 – eltérési térkép'), 'Suša 2026. – po ARKOD parcelama': ('Drought 2026 – by ARKOD parcel', 'Aszály 2026 – ARKOD-parcellánként'), 'Visoki vodostaj Dunava, rujan 2024. – karta poplavljenih površina': ('High Danube water, September 2024 – flooded area map', 'Magas dunai vízállás, 2024. szeptember – elöntött területek térképe'), 'Visoki vodostaj Dunava, rujan 2024. – udio poplavljenosti po ARKOD parcelama': ('High Danube water, September 2024 – flooded share by ARKOD parcel', 'Magas dunai vízállás, 2024. szeptember – elöntött arány ARKOD-parcellánként'), 'Nepogode iz satelita': ('Natural hazards from satellites', 'Elemi károk műholdról'), 'bez značajne poplave (< 10 %)': ('no significant flooding (< 10 %)', 'nincs jelentős elöntés (< 10 %)'), 'djelomično poplavljena (10–50 %)': ('partly flooded (10–50 %)', 'részben elöntött (10–50 %)'), 'pretežno poplavljena (≥ 50 %)': ('mostly flooded (≥ 50 %)', 'nagyrészt elöntött (≥ 50 %)'), 'poplavljeno (voda koje inače nema)': ('flooded (water not normally present)', 'elöntött (szokatlan víz)'), 'uobičajena vodena površina': ('usual water surface', 'szokásos vízfelület'), 'dobra': ('good', 'jó'), 'prihvatljiva': ('fair', 'elfogadható'), 'umjerena': ('moderate', 'mérsékelt'), 'loša': ('poor', 'rossz'), 'vrlo loša': ('very poor', 'nagyon rossz'), 'izrazito loša': ('extremely poor', 'rendkívül rossz')})
T.update({'Brzi prikazi': ('Quick views', 'Gyors nézetek'), 'Intenzitet podloge': ('Basemap intensity', 'Alaptérkép erőssége'), 'Izmjeri udaljenost': ('Measure distance', 'Távolság mérése'), 'Neprozirnost sloja': ('Layer opacity', 'Réteg átlátszatlansága'), 'Odabir podloge': ('Basemap choice', 'Alaptérkép választása'), 'Pretraga': ('Search', 'Keresés'), 'Slojevi': ('Layers', 'Rétegek'), 'blago ispod prosjeka': ('slightly below average', 'kissé átlag alatti'), 'blago iznad prosjeka': ('slightly above average', 'kissé átlag feletti'), 'iznad prosjeka': ('above average', 'átlag feletti'), 'izrazito ispod prosjeka': ('far below average', 'jóval átlag alatti'), 'znatno ispod prosjeka': ('well below average', 'jelentősen átlag alatti'), 'Dodajte staru fotografiju ili narodni naziv mjesta': ('Add an old photo or a local place name', 'Adjon hozzá régi fényképet vagy népi helynevet'), 'Kada se odvozi otpad u mojoj ulici': ('When is waste collected in my street', 'Mikor viszik el a hulladékot az utcámban'), 'Koordinate u HTRS96/TM': ('Coordinates in HTRS96/TM', 'Koordináták HTRS96/TM rendszerben'), 'Promijeni podlogu': ('Change basemap', 'Alaptérkép váltása'), 'Crno-bijela podloga': ('Black-and-white basemap', 'Fekete-fehér alaptérkép'), 'Izgled': ('Appearance', 'Megjelenés'), 'Podloga': ('Basemap', 'Alaptérkép'), 'Preko podloge': ('Over the basemap', 'Az alaptérkép fölött'), 'trenutno': ('current', 'jelenlegi'), 'Reset rotation': ('Reset rotation', 'Elforgatás visszaállítása'), 'amfiglej, hipoglej': ('amphigley, hypogley', 'amfiglej, hipoglej'), 'hipoglej, amfiglej': ('hypogley, amphigley', 'hipoglej, amfiglej')})
T.update({'Adresa': ('Address', 'Cím'), 'Ambulanta': ('Health clinic', 'Rendelő'), 'Ambulanta:': ('Health clinic:', 'Rendelő:'), 'Autobusno stajalište:': ('Bus stop:', 'Buszmegálló:'), 'Dječje igralište:': ('Playground:', 'Játszótér:'), 'Dječji vrtić:': ('Kindergarten:', 'Óvoda:'), 'E-adresa': ('E-mail address', 'E-mail-cím'), 'E-adresu koristimo samo za prijavu na portal i eventualni upit općinskih službi o vašoj prijavi. Ne objavljuje se i ne dijeli s drugima.': ('We use your e-mail address only to sign you in and, if needed, for questions from municipal services about your report. It is never published or shared.', 'E-mail-címét csak a bejelentkezéshez és a bejelentésével kapcsolatos esetleges kérdésekhez használjuk. Nem tesszük közzé és nem adjuk tovább.'), 'Građevinsko područje': ('Building zone', 'Építési terület'), 'Informativni podaci iz javnih servisa DGU-a, Hrvatskih voda i podataka općine. Nemaju pravnu snagu; za službene podatke obratite se nadležnim tijelima (katastar, zemljišne knjige, Jedinstveni upravni odjel Općine Bilje).': ('Information from public services of the State Geodetic Administration, Croatian Waters and the municipality. It has no legal force; for official data contact the competent authorities (cadastre, land registry, municipal administration).', 'Tájékoztató adatok a Állami Földmérési Hivatal, a Horvát Vizek és a község nyilvános szolgáltatásaiból. Jogi erejük nincs; hivatalos adatokért forduljon az illetékes hatóságokhoz (kataszter, telekkönyv, községi hivatal).'), 'Izvan glavne vegetacije': ('Outside the main growing season', 'A fő vegetációs időszakon kívül'), 'Izvorni kod portala (otvoreni kod)': ('Portal source code (open source)', 'A portál forráskódja (nyílt forráskód)'), 'Katastarska čestica': ('Cadastral parcel', 'Kataszteri parcella'), 'Komunalna infrastruktura': ('Municipal infrastructure', 'Kommunális infrastruktúra'), 'Koordinate': ('Coordinates', 'Koordináták'), 'Kultura je procijenjena iz oblika krivulje bujnosti (kad niče, kad je vrhunac, kad se žanje). Nije službeni podatak i može biti pogrešna – posebno kukuruz i soja te dvostruki usjevi.': ('The crop is estimated from the shape of the vigour curve (emergence, peak, harvest). It is not official data and may be wrong – especially maize vs soybean and double cropping.', 'A növényfajt a dússági görbe alakjából becsüljük (kelés, csúcs, betakarítás). Nem hivatalos adat, és tévedhet – különösen kukorica és szója, illetve másodvetés esetén.'), 'Kulturna baština i krajobraz': ('Cultural heritage and landscape', 'Kulturális örökség és táj'), 'Ljekarna': ('Pharmacy', 'Gyógyszertár'), 'Ljekarna:': ('Pharmacy:', 'Gyógyszertár:'), 'Mala vjerojatnost': ('Low probability', 'Kis valószínűség'), 'Srednja vjerojatnost (100 god.)': ('Medium probability (100 yr)', 'Közepes valószínűség (100 év)'), 'Velika vjerojatnost': ('High probability', 'Nagy valószínűség'), 'Miješani komunalni otpad': ('Mixed municipal waste', 'Vegyes kommunális hulladék'), 'Papir i karton': ('Paper and cardboard', 'Papír és karton'), 'Plastika i metal': ('Plastic and metal', 'Műanyag és fém'), 'Moja adresa': ('My address', 'Saját cím'), 'NDMI (voda u biljci) pokazuje sadržaj vode u lišću: niske vrijednosti kod razvijenog usjeva znače sušni stres.': ('NDMI (water in the plant) shows the water content of leaves: low values in a developed crop mean drought stress.', 'Az NDMI (víz a növényben) a levelek víztartalmát mutatja: fejlett állománynál az alacsony érték aszálystresszt jelez.'), 'NDVI (bujnost) pokazuje koliko je zelene, žive biljne mase: ispod 0,2 golo tlo, 0,2–0,5 mlad ili rijedak usjev, iznad 0,6 gust, zdrav usjev.': ('NDVI (vigour) shows how much green, living plant mass there is: below 0.2 bare soil, 0.2–0.5 young or sparse crop, above 0.6 dense, healthy crop.', 'Az NDVI (dússág) a zöld, élő növényi tömeget mutatja: 0,2 alatt csupasz talaj, 0,2–0,5 fiatal vagy ritka állomány, 0,6 felett sűrű, egészséges állomány.'), 'Najbliža adresa': ('Nearest address', 'Legközelebbi cím'), 'Najveća bujnost': ('Peak vigour', 'Legnagyobb dússág'), 'Nekretnina općine': ('Municipal property', 'Községi ingatlan'), 'Nema otvorenih prijava.': ('No open reports.', 'Nincs nyitott bejelentés.'), 'Nepogode i poplave (satelitska analiza)': ('Natural hazards and floods (satellite analysis)', 'Elemi károk és árvizek (műholdas elemzés)'), 'Obavijest o zaštiti osobnih podataka': ('Privacy notice', 'Adatvédelmi tájékoztató'), 'Opasnost od poplava (Hrvatske vode, 2019.)': ('Flood hazard (Croatian Waters, 2019)', 'Árvízveszély (Horvát Vizek, 2019)'), 'Općinska imovina i infrastruktura': ('Municipal property and infrastructure', 'Községi vagyon és infrastruktúra'), 'Osnovno': ('Basics', 'Alapadatok'), 'Ova sezona bila je uobičajena': ('This season was as usual', 'Ez az évad a szokásos volt'), 'Plodored – procjena sa satelita': ('Crop rotation – satellite estimate', 'Vetésforgó – műholdas becslés'), 'Podaci: Sentinel-2 (Copernicus, EU), razlučivost 10 m, snimanje svakih 2–5 dana; računaju se samo dani kad je parcela bez oblaka. Satelit pokazuje gdje treba pogledati – na terenu se utvrđuje zašto.': ('Data: Sentinel-2 (Copernicus, EU), 10 m resolution, images every 2–5 days; only cloud-free days are used. The satellite shows where to look – the reason is found in the field.', 'Adatok: Sentinel-2 (Copernicus, EU), 10 m felbontás, 2–5 naponta készülő felvételek; csak a felhőmentes napokat vesszük figyelembe. A műhold megmutatja, hova kell nézni – az okot a helyszínen kell megállapítani.'), 'Podijeli ovu lokaciju': ('Share this location', 'Hely megosztása'), 'Poveznice': ('Links', 'Hivatkozások'), 'Pošalji poveznicu': ('Send link', 'Hivatkozás küldése'), 'Praćene parcele i njihova upozorenja vidite gumbom „Moje parcele” na karti. Popis se čuva samo u ovom pregledniku.': ('Followed parcels and their warnings are under the “My parcels” button on the map. The list is kept only in this browser.', 'A követett parcellák és figyelmeztetéseik a térképen a „Parcelláim” gombbal érhetők el. A lista csak ebben a böngészőben tárolódik.'), 'Prijava na portal': ('Sign in to the portal', 'Bejelentkezés a portálra'), 'Prostorni plan (PPUO, stanje 2017. – nije aktualno)': ('Spatial plan (2017 – not current)', 'Rendezési terv (2017 – nem aktuális)'), 'Satelit: sezone 2018.–2026.': ('Satellite: seasons 2018–2026', 'Műhold: 2018–2026-os évadok'), 'Sezona': ('Season', 'Évad'), 'Spremi poveznicu': ('Save link', 'Hivatkozás mentése'), 'Sve o ovoj lokaciji': ('All about this location', 'Minden erről a helyről'), 'Trgovina:': ('Shop:', 'Üzlet:'), 'Škola:': ('School:', 'Iskola:'), 'Zeleni otok / reciklaža:': ('Recycling point:', 'Szelektív gyűjtő:'), 'Udaljenosti su procjena (zračna linija × 1,3). Prostorni plan, poplave i zaštitu provjerite pod "Sve o ovoj lokaciji".': ('Distances are estimates (straight line × 1.3). Check the spatial plan, floods and protection under “All about this location”.', 'A távolságok becsültek (légvonal × 1,3). A rendezési tervet, árvizeket és védettséget a „Minden erről a helyről” alatt ellenőrizze.'), 'Visoki vodostaj Dunava, rujan 2024.': ('High Danube water, September 2024', 'Magas dunai vízállás, 2024. szeptember'), 'Voda u biljci (NDMI)': ('Water in the plant (NDMI)', 'Víz a növényben (NDMI)'), 'Vrhunci po sezonama': ('Peaks by season', 'Csúcsok évadonként'), 'Za slanje prijave dovoljna je e-adresa: na nju šaljemo poveznicu za prijavu. Lozinka nije potrebna.': ('To send a report you only need an e-mail address: we send a sign-in link to it. No password is needed.', 'A bejelentéshez elég egy e-mail-cím: erre küldjük a belépési hivatkozást. Jelszó nem szükséges.'), 'izvan građevinskog područja (prema planu iz 2017.)': ('outside the building zone (2017 plan)', 'építési területen kívül (2017-es terv szerint)'), 'kukuruz/soja': ('maize/soybean', 'kukorica/szója'), 'nema adrese u blizini': ('no address nearby', 'nincs cím a közelben'), 'nije ARKOD parcela': ('not an ARKOD parcel', 'nem ARKOD-parcella'), 'ozima': ('winter crop', 'őszi vetés'), 'suncokret': ('sunflower', 'napraforgó'), 'prethodne sezone': ('previous seasons', 'korábbi évadok'), 'servis DGU-a trenutno nije dostupan': ('the cadastre service is currently unavailable', 'a kataszteri szolgáltatás jelenleg nem érhető el'), 'servis nije dostupan': ('service unavailable', 'a szolgáltatás nem érhető el'), 'vrhunac sezone': ('season peak', 'évadcsúcs'), 'Što znače ove vrijednosti?': ('What do these values mean?', 'Mit jelentenek ezek az értékek?'), '☆ Prati ovu parcelu': ('☆ Follow this parcel', '☆ Parcella követése'), '📅 Dodaj u kalendar': ('📅 Add to calendar', '📅 Hozzáadás a naptárhoz'), '📍 U blizini': ('📍 Nearby', '📍 A közelben'), '🗑️ Odvoz otpada': ('🗑️ Waste collection', '🗑️ Hulladékszállítás'), '🛠️ Prijavljeni problemi u blizini (400 m)': ('🛠️ Reported problems nearby (400 m)', '🛠️ Bejelentett problémák a közelben (400 m)')})
UZORCI = [['^(.+) · ~(\\d+) min pješice$', '$1 · ~$2 min walk', '$1 · ~$2 perc gyalog'], ['^ponedjeljak, (.+)$', 'Monday, $1', 'hétfő, $1'], ['^utorak, (.+)$', 'Tuesday, $1', 'kedd, $1'], ['^srijeda, (.+)$', 'Wednesday, $1', 'szerda, $1'], ['^četvrtak, (.+)$', 'Thursday, $1', 'csütörtök, $1'], ['^petak, (.+)$', 'Friday, $1', 'péntek, $1'], ['^subota, (.+)$', 'Saturday, $1', 'szombat, $1'], ['^nedjelja, (.+)$', 'Sunday, $1', 'vasárnap, $1'], ['\\(sutra\\)', '(tomorrow)', '(holnap)'], ['\\(danas\\)', '(today)', '(ma)'], ['\\(za (\\d+) dana\\)', '(in $1 days)', '($1 nap múlva)'], ['^Zadnja čista snimka (.+) – bujnost ([\\d,]+) \\(tlo uglavnom bez zelenog pokrova\\)\\.$', 'Last clear image $1 – vigour $2 (soil mostly without green cover).', 'Utolsó felhőmentes felvétel: $1 – dússág $2 (a talaj nagyrészt zöld borítás nélküli).'], ['^Najveća bujnost ([\\d,]+) \\((.+)\\) prema uobičajenih ([\\d,]+) u prethodnim sezonama\\. Razlika može biti i zbog druge kulture u plodoredu – usporedite s onim što ste sijali\\.$', 'Peak vigour $1 ($2) against the usual $3 in previous seasons. The difference may also be due to a different crop in the rotation – compare with what you sowed.', 'Legnagyobb dússág $1 ($2) a korábbi évadok szokásos $3 értékével szemben. Az eltérés a vetésforgóban szereplő más növényből is adódhat – vesse össze azzal, amit vetett.']]
PREFIKSI = {'Više o sloju ': ('More about the layer ', 'Bővebben: '), 'Isključi sloj ': ('Turn off layer ', 'Réteg kikapcsolása: '), 'Uključi sloj ': ('Turn on layer ', 'Réteg bekapcsolása: ')}

for _t in (T_VR, T_SAT, T_OST):
    T.update(_t)
UZORCI = UZORCI + [u for u in U_VR if u[1]] + U_SAT + U_OST + [[r'^' + d + r' (\d+\.)$', v[0] + ' $1', v[1] + ' $1'] for d, v in DANI.items()]

for jez, idx in (('en', 0), ('hu', 1)):
    p = f'config/prijevodi/{jez}.json'
    d = json.load(open(p))
    if jez == 'hu':
        for k, v in HU_SLOJEVI.items():
            d['slojevi'].setdefault(k, v)
    for hr, par in T.items():
        d['tekst'][hr] = par[idx]
    d['uzorci'] = [[u[0], u[1 + idx]] for u in UZORCI]
    d['prefiksi'] = {k: v[idx] for k, v in PREFIKSI.items()}
    json.dump(d, open(p, 'w'), ensure_ascii=False, indent=1)
    print(jez, len(d['slojevi']), len(d['tekst']))
