#!/usr/bin/env python3
"""
Audit and fix the word bank:
1. Fix miscategorized words
2. Reclassify A1/A2 difficulty
3. Prune low-value words
"""

import csv
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
META_CSV = SCRIPT_DIR / "starter_nouns_meta.csv"
LEMMAS_TXT = SCRIPT_DIR / "starter_lemmas.txt"
KZK2_JSON = SCRIPT_DIR / "kzk2_nouns.json"

# Load KzK2 lemmas (protected from pruning)
with open(KZK2_JSON, encoding="utf-8") as f:
    kzk2_data = json.load(f)
KZK2_LEMMAS = set()
for entry in kzk2_data:
    lemma = entry.get("lemma", "").lower()
    # Handle slash entries like "cestovatel/ka"
    if "/" in lemma:
        parts = lemma.split("/")
        KZK2_LEMMAS.add(parts[0])
    else:
        KZK2_LEMMAS.add(lemma)

# ─── CATEGORY FIXES ───
# Map: lemma -> corrected categories
# These fix keyword-matching errors where e.g. "arm" in "armáda" matched "body"

CATEGORY_OVERRIDES: dict[str, str] = {
    # === Animals miscategorization ===
    "míra": "misc,abstract",           # "rate" not an animal
    "příprava": "misc",                # "preparation" not an animal
    "spolupráce": "misc",              # "cooperation" not an animal
    "provoz": "misc",                  # "operation" not an animal
    "úvaha": "misc,abstract",          # "consideration" not an animal
    "poměr": "misc,abstract",          # "ratio" not an animal
    "výhoda": "misc,abstract",         # "advantage" not an animal
    "přednost": "misc,abstract",       # "advantage" not an animal
    "operace": "misc",                 # "operation" not an animal
    "generace": "misc,abstract",       # "generation" not an animal
    "komunikace": "misc",              # "communication" not an animal
    "kategorie": "misc",               # "category" not an animal
    "účastník": "misc,people",         # "participant" not an animal
    "teplota": "misc",                 # "temperature" not an animal
    "literatura": "misc,abstract",     # "literature" not an animal
    "varianta": "misc",                # "variant" not an animal
    "přístroj": "objects",             # "apparatus" is an object
    "strategie": "misc,abstract",      # "strategy" not an animal
    "výchova": "misc,abstract",        # "education" not an animal
    "výklad": "misc",                  # "explication" not an animal
    "aplikace": "misc",                # "application" not an animal
    "oslava": "misc,event",            # "celebration" not an animal
    "konkurence": "misc",              # "competition" not an animal
    "doklad": "objects",               # "certificate/document" is an object
    "koberec": "objects",              # "carpet" is an object
    "dotace": "misc",                  # "grant" not an animal
    "záruka": "misc",                  # "guarantee" not an animal
    "obyvatel": "misc,people",         # "inhabitant" is a person
    "rostlina": "nature",              # "plant" is nature not animals
    "vzdělání": "misc,abstract",       # "education" not an animal

    # === Body miscategorization ===
    "armáda": "misc",                  # "army" not body (matched "arm")
    "výzkum": "misc,abstract",         # "research" not body
    "strach": "misc,abstract",         # "fear" not body (emotion)
    "krok": "misc",                    # "footstep" not body
    "židle": "objects",                # "chair" is an object
    "křeslo": "objects",               # "armchair" is an object
    "hledání": "misc,abstract",        # "searching" not body
    "fotbal": "misc,event",            # "football" not body
    "fotbalista": "misc,people",       # "footballer" is a person
    "plocha": "misc",                  # "surface" not body
    "povrch": "misc",                  # "surface" not body
    "pozadí": "misc",                  # "background" not body
    "ročník": "time",                  # "year/class year" is time
    "pověst": "misc",                  # "legend" not body
    "prádlo": "objects",               # "underwear" is an object
    "slza": "body",                    # keep - tear is body-related

    # === Food miscategorization ===
    "cena": "misc",                    # "price" not food
    "tým": "misc,people",             # "team" not food

    # === Time miscategorization ===
    "škoda": "misc",                   # "damage" not time
    "agentura": "misc",               # "agency" not time
    "kandidát": "misc,people",         # "candidate" not time
    "průměr": "misc",                  # "average" not time
    "centimetr": "misc",              # "centimetre" not time
    "mzda": "misc",                    # "wages" not time
    "tragedie": "misc,event",          # "tragedy" not time
    "chata": "places",                 # "cottage" is a place
    "chalupa": "places",               # "cottage" is a place
    "manželství": "family",            # "marriage" is family
    "odvaha": "misc,abstract",         # "courage" not time

    # === Places miscategorization ===
    "výzva": "misc",                   # "challenge" not places
    "prohlášení": "misc",             # "statement" not places
    "tvrzení": "misc",                # "statement" not places
    "výrok": "misc",                  # "statement" not places
    "přenos": "misc",                 # "broadcast" not places
    "objem": "misc",                  # "capacity" not places
    "výstavba": "misc",               # "building (process)" not places
    "kapacita": "misc",               # "capacity" not places

    # === Transportation miscategorization ===
    "karta": "objects",               # "card" is an object
    "vazba": "misc",                  # "relationship" not transportation
    "kariéra": "misc",               # "career" not transportation
    "mistrovství": "misc,event",      # "championship" not transportation
    "lístek": "objects",              # "ticket" is an object

    # === People miscategorization ===
    "důvod": "misc",                  # "reason" not people
    "srovnání": "misc",              # "comparison" not people
    "sezóna": "time",                # "season" is time
    "faktor": "misc",                # "factor" not people
    "rozum": "misc,abstract",        # "reason" not people
    "zájemce": "misc,people",        # keep people tag but not family
    "jed": "misc",                   # "poison" not family
    "písnička": "misc",              # "song" not family
    "píseň": "misc",                 # "song" not family
    "vězení": "places",              # "prison" is a place
    "dětství": "time,family",        # childhood is time+family
    "pití": "food",                  # "drinking" is food-related
    "továrna": "places",             # "factory" is a place
    "představení": "misc,event",     # "performance" is an event

    # === Event miscategorization ===
    "skříň": "objects",              # "wardrobe" is an object
    "vědomí": "misc,abstract",       # "awareness" not event
    "stopa": "misc",                 # "trace" not event
    "odměna": "misc",                # "reward" not event

    # === Objects miscategorization ===
    "náklad": "misc",                # "expense" not objects
    "představitel": "misc,people",   # "representative" is a person
    "vydání": "misc",               # "expenses" not objects
    "výdaj": "misc",                # "expense" not objects
    "zahájení": "misc,event",       # "opening" is an event
    "pokuta": "misc",               # "penalty" not objects
    "důchod": "misc",               # "pension" not objects
    "heslo": "misc",                # "password" not objects

    # === Misc fixes for better categories ===
    "člověk": "misc,people",         # person
    "student": "misc,people",        # student
    "přítel": "misc,people",         # friend
    "most": "places",               # bridge is a place
    "práce": "misc",                # work
    "radost": "misc,abstract",      # joy
    "slovo": "misc",                # word
    "život": "misc",                # life
    "smrt": "misc",                 # death
    "problém": "misc",              # problem
    "otázka": "misc",               # question
    "pravda": "misc,abstract",      # truth
    "svoboda": "misc,abstract",     # freedom
    "strana": "misc",               # side
    "případ": "misc",               # case
    "svět": "places",              # world
    "cesta": "misc",               # way
    "konec": "time",               # end
    "společnost": "misc",          # company
    "koruna": "misc",              # crown/currency
    "stát": "places",              # state
    "změna": "misc",               # change
    "síla": "misc,abstract",       # force
    "zákon": "misc",               # law
    "právo": "misc",               # right
    "vláda": "misc",               # government
    "tělo": "body",                # body
    "smysl": "misc,abstract",      # sense
    "léto": "time,nature",         # summer
    "válka": "misc",               # war
    "hra": "misc",                 # game
    "hospoda": "places",           # pub
    "kostel": "places",            # church
    "církev": "misc",              # church (institution)
    "kancelář": "places",          # office
    "knihovna": "places",           # library
    "nemocnice": "places",         # hospital
    "pošta": "places",             # post office
    "banka": "places",             # bank
    "divadlo": "places",           # theatre
    "hala": "places",              # hall
    "barák": "places",             # house
    "domek": "places",             # house
    "neděle": "time",              # Sunday
    "sobota": "time",              # Saturday
    "pátek": "time",               # Friday
    "čtvrtek": "time",             # Thursday
    "středa": "time",              # Wednesday
    "pondělí": "time",             # Monday
    "úterý": "time",               # Tuesday
    "leden": "time",               # January
    "únor": "time",                # February
    "březen": "time",              # March
    "duben": "time",               # April
    "květen": "time",              # May
    "červen": "time",              # June
    "červenec": "time",            # July
    "srpen": "time",               # August
    "září": "time",                # September
    "říjen": "time",               # October
    "listopad": "time",            # November
    "prosinec": "time",            # December
    "jaro": "time,nature",         # spring
    "podzim": "time,nature",       # autumn
    "zima": "time,nature",         # winter
    "večer": "time",               # evening
    "ráno": "time",                # morning
    "okamžik": "time",             # moment
    "moment": "time",              # moment
    "datum": "time",               # date
    "období": "time",              # period
    "doba": "time",                # time/era
    "století": "time",             # century
    "víkend": "time",              # weekend
    "dovolená": "time",            # holiday
    "svátek": "time",              # holiday
    "začátek": "time",             # beginning
    "počátek": "time",             # beginning
    "současnost": "time",          # present day
    "minulost": "time",            # past
    "budoucnost": "time",          # future
    "budoucno": "time",            # future
    "táta": "family",              # dad
    "máma": "family",              # mum
    "maminka": "family",           # mum
    "mamka": "family",             # mum
    "tatínek": "family",           # daddy
    "taťka": "family",             # daddy
    "děda": "family,people",       # grandpa
    "rodič": "family,people",      # parent
    "kluk": "family,people",       # boy
    "holka": "family,people",      # girl
    "dívka": "family,people",      # girl
    "paní": "family,people",       # Mrs
    "pan": "family,people",        # sir
    "slečna": "family,people",     # miss
    "bůh": "misc",                 # God
    "oběd": "food,meal",           # lunch
    "večeře": "food,meal",         # dinner
    "snídaně": "food,meal",        # breakfast
    "kafe": "food",                # coffee
    "polévka": "food",             # soup
    "potravina": "food",           # food
    "brambor": "food",             # potato
    "zelenina": "food",            # vegetable
    "ovoce": "food",               # fruit
    "cukr": "food",                # sugar
    "sůl": "food",                 # salt
    "olej": "food",                # oil
    "nůž": "objects",              # knife
    "doprava": "transportation",   # transport
    "vůz": "transportation",       # vehicle
    "vozidlo": "transportation",   # vehicle
    "let": "transportation",       # flight
    "loď": "transportation",       # ship
    "automobil": "transportation", # automobile
    "letadlo": "transportation",   # aircraft
    "dálnice": "transportation",   # motorway
    "silnice": "places",           # road is a place
    "chodník": "places",           # pavement is a place
    "nebe": "nature",              # sky
    "sníh": "nature",              # snow
    "vítr": "nature",              # wind
    "déšť": "nature",              # rain
    "led": "nature",               # ice
    "kámen": "nature",             # stone
    "dřevo": "nature",             # wood
    "pták": "animals",             # bird
    "kůň": "animals",             # horse
    "zvíře": "animals",           # animal
    "kráva": "animals",           # cow
    "houba": "food,nature",       # mushroom
    "hlad": "food",               # hunger
    "bolest": "body",             # pain
    "nemoc": "body",              # illness (well, health/body)
    "choroba": "body",            # disease
    "krev": "body",               # blood
    "mozek": "body",              # brain
    "srdce": "body",              # heart
    "zub": "body",                # tooth
    "koleno": "body",             # knee
    "krk": "body",                # neck
    "prst": "body",               # finger
    "rameno": "body",             # shoulder
    "obličej": "body",            # face
    "tvář": "body",               # face
    "čelo": "body",               # forehead
    "vlas": "body",               # hair
    "kůže": "body",               # skin
    "ret": "body",                # lip
    "kost": "body",               # bone
    "dlaň": "body",               # palm
    "paže": "body",               # arm
    "břicho": "body",             # stomach
    "žaludek": "body",            # stomach
    "pusa": "body",               # mouth
    "hrdlo": "body",              # throat
    "schůzka": "misc,event",      # date/meeting
    "koncert": "misc,event",      # concert
    "setkání": "misc,event",      # meeting
    "volba": "misc,event",        # election
    "zápas": "misc,event",        # match
    "utkání": "misc,event",       # match
    "svatba": "misc,event",       # wedding
    "hudba": "misc",              # music
    "film": "misc",               # film
    "sport": "misc",              # sport
    "přítelkyně": "family",       # girlfriend
    "kamarád": "misc,people",     # friend
    "kamarádka": "misc,people",   # friend (f)
    "kolega": "misc,people",      # colleague
    "soused": "misc,people",      # neighbour
    "trenér": "misc,people",      # trainer
    "doktor": "misc,people",      # doctor
    "lékař": "misc,people",       # doctor
    "učitel": "misc,people",      # teacher
    "policista": "misc,people",   # policeman
    "řidič": "misc,people",       # driver
    "voják": "misc,people",       # soldier
    "prezident": "misc,people",   # president
    "ministr": "misc,people",     # minister
    "předseda": "misc,people",    # chairman
    "šéf": "misc,people",         # boss
    "ředitel": "misc,people",     # director
    "král": "misc,people",        # king
    "profesor": "misc,people",    # professor
    "herec": "misc,people",       # actor
    "spisovatel": "misc,people",  # writer
    "odborník": "misc,people",    # expert
    "expert": "misc,people",      # expert
    "autor": "misc,people",       # author
    "partner": "misc,people",     # partner
    "majitel": "misc,people",     # owner
    "pacient": "misc,people",     # patient
    "svědek": "misc,people",      # witness
    "občan": "misc,people",       # citizen
    "host": "misc,people",        # guest
    "turista": "misc,people",     # tourist
    "cizinec": "misc,people",     # foreigner
    "mladík": "misc,people",      # young man
    "žák": "misc,people",         # pupil
    "hráč": "misc,people",        # player
    "divák": "misc,people",       # viewer
    "pracovník": "misc,people",   # worker
    "zaměstnanec": "misc,people", # employee
    "podnikatel": "misc,people",  # businessman
    "zákazník": "misc,people",    # customer
    "malíř": "misc,people",       # painter
    "režisér": "misc,people",     # director
    "dáma": "misc,people",        # lady
    "ženská": "misc,people",      # woman
    "chlap": "misc,people",       # man
    "osobnost": "misc,people",    # personality
    "osoba": "misc,people",       # person
    "správa": "misc",             # management
    "vedení": "misc",             # management
    "komunista": "misc,people",   # communist
    "zloděj": "misc,people",      # thief
    "hrdina": "misc,people",      # hero
    "vítěz": "misc,people",       # winner
    "starosta": "misc,people",    # mayor
    "premiér": "misc,people",     # premier
    "blázen": "misc,people",      # fool
    "chudák": "misc,people",      # poor person
    "jedinec": "misc,people",     # individual
    "nepřítel": "misc,people",    # enemy
    "investor": "misc,people",    # investor
    "návštěvník": "misc,people",  # visitor
    "příslušník": "misc,people",  # member
    "výrobce": "misc,people",     # manufacturer
    "poslanec": "misc,people",    # deputy
    "zástupce": "misc,people",    # deputy
    "představitel": "misc,people", # representative
    "velitel": "misc,people",     # commander
    "důstojník": "misc,people",   # officer
    "kandidát": "misc,people",    # candidate
    "dělník": "misc,people",      # worker
    "fotbalista": "misc,people",  # footballer
    "hoch": "misc,people",        # boy
    "soudce": "misc,people",      # judge
    "brácha": "family,people",    # brother
    "cigareta": "misc",           # cigarette
    "alkohol": "misc",            # alcohol
    "internet": "misc",           # internet
    "televize": "objects",        # television
    "rádio": "objects",           # radio
    "mobil": "objects",           # mobile phone
    "fotografie": "objects",      # photograph
    "fotka": "objects",           # photo
    "kamera": "objects",          # camera
    "mapa": "objects",            # map
    "dopis": "objects",           # letter
    "adresa": "misc",            # address
    "taška": "objects",           # bag
    "postel": "objects",          # bed
    "stůl": "objects",            # table
    "sklo": "objects",            # glass
    "tabulka": "objects",         # table
    "talíř": "objects",           # plate
    "láhev": "objects",           # bottle
    "obrázek": "objects",         # picture
    "obraz": "objects",           # picture
    "klíč": "objects",            # key
    "snímek": "objects",          # photo
    "knížka": "objects",          # book
    "deska": "objects",           # board
    "zrcadlo": "objects",         # mirror
    "stroj": "objects",           # machine
    "pytel": "objects",           # bag
    "krabice": "objects",         # box
    "dar": "objects",             # gift
    "dárek": "objects",           # present
    "zbraň": "objects",           # weapon
    "nástroj": "objects",         # tool
    "přístroj": "objects",        # apparatus
    "nábytek": "objects",         # furniture
    "lůžko": "objects",           # bed
    "pohár": "objects",           # cup
    "prsten": "objects",          # ring
    "automat": "objects",         # machine
    "meč": "objects",             # sword
    "skříňka": "objects",         # box
    "učebnice": "objects",        # textbook
    "lampa": "objects",           # lamp
    "volant": "objects",          # steering wheel
    "aparát": "objects",          # machinery
    "hrnec": "objects",           # pot
    "písmeno": "objects",         # letter (character)
    "stolek": "objects",          # table
    "sklenice": "objects",        # glass
    "sklenička": "objects",       # glass (small)
    "bedna": "objects",           # box
    "kroužek": "objects",         # ring
    "krabička": "objects",        # box
    "plášť": "objects",           # coat
    "oděv": "objects",            # clothes
    "schránka": "objects",        # box
    "stěna": "places",            # wall is part of a place
    "zeď": "places",              # wall
    "podlaha": "places",          # floor
    "střecha": "places",          # roof
    "strop": "places",            # ceiling
    "brána": "places",            # gate
    "chodba": "places",           # corridor
    "schod": "places",            # step
    "roh": "places",              # corner
    "kout": "places",             # corner
    "ložnice": "places",          # bedroom
    "koupelna": "places",         # bathroom
    "kuchyně": "places",          # kitchen
    "záchod": "places",           # toilet
    "sklep": "places",            # cellar
    "zahrada": "nature,places",   # garden
    "pole": "nature,places",      # field
    "hora": "nature,places",      # mountain
    "řeka": "nature",             # river
    "ostrov": "nature,places",    # island
    "kopec": "nature,places",     # hill
    "krajina": "nature,places",   # landscape
    "břeh": "nature,places",      # bank/shore
    "příroda": "nature",          # nature
    "strom": "nature",            # tree
    "květ": "nature",             # flower
    "tráva": "nature",            # grass
    "list": "nature",             # leaf
    "větev": "nature",            # branch
    "kořen": "nature",            # root
    "hovor": "misc",              # talk
    "angličtina": "misc",         # English
    "čeština": "misc",            # Czech
    "jazyk": "misc",              # language

    # === More animals miscategorizations (from later CSV rows) ===
    "publikace": "misc",          # "publication" not animals
    "obnova": "misc",             # "restoration" not animals
    "ukázka": "misc",             # "demonstration" not animals
    "potomek": "misc,people",     # "descendant" not animals
    "slavnost": "misc,event",     # "celebration" not animals
    "družstvo": "misc",           # "cooperative" not animals
    "kvalifikace": "misc",        # "competence" not animals
    "náznak": "misc",             # "indication" not animals
    "inspirace": "misc,abstract", # "inspiration" not animals
    "školství": "misc",           # "education" not animals
    "soustředění": "misc,abstract", # "concentration" not animals
    "nevýhoda": "misc,abstract",  # "disadvantage" not animals
    "sazba": "misc",              # "rate" not animals
    "elektrárna": "places",       # "power plant" is a place
    "integrace": "misc",          # "integration" not animals
    "ukazatel": "misc",           # "indicator" not animals
    "neschopnost": "misc,abstract", # "incompetence" not animals
    "provozovatel": "misc,people", # "operator" not animals
    "demokrat": "misc,people",    # "democrat" not animals
    "koncentrace": "misc",        # "concentration" not animals
    "laboratoř": "places",        # "laboratory" is a place
    "vzdělávání": "misc,abstract", # "education" not animals
    "komplikace": "misc",         # "complication" not animals
    "konkurent": "misc,people",   # "competitor" not animals
    "federace": "misc",           # "federation" not animals
    "uchazeč": "misc,people",     # "applicant" not animals
    "kompetence": "misc",         # "competence" not animals
    "fungování": "misc",          # "operation" not animals
    "trvání": "time",             # "duration" is time
    "demonstrace": "misc,event",  # "demonstration" not animals
    "obdiv": "misc,abstract",     # "admiration" not animals
    "benzín": "misc",             # "petrol" not animals
    "konkurs": "misc",            # "competition" not animals
    "asistent": "misc,people",    # "assistant" not animals
    "trubka": "objects",          # "trumpet" is an object
    "katalog": "objects",         # "catalogue" is an object
    "gratulace": "misc,event",    # "congratulations" not animals
    "ilustrace": "misc",          # "illustration" not animals
    "dostihy": "misc,event",      # "horse-races" not animals
    "úřednice": "misc,people",    # "bureaucrat" not animals
    "onemocnění": "body",         # "disease" is body
    "včela/včelka": "animals",    # keep - actual animals
    "zvířátko": "animals",        # keep - actual animals
    "motýl": "animals",           # keep - actual animals
    "morče": "animals",           # keep - actual animals

    # === More body miscategorizations ===
    "štáb": "misc",               # "headquarters" not body
    "legislativa": "misc",        # "legislation" not body
    "vojsko": "misc",             # "army" not body
    "písmo": "misc",              # "handwriting" not body
    "zázemí": "misc",             # "background" not body
    "rukopis": "misc",            # "handwriting" not body
    "vozík": "transportation",    # "handcart" is transportation
    "miláček": "family,people",   # "sweetheart" not body
    "hlavička": "body",           # "header/little head" - keep body
    "klika": "objects",           # "handle" is an object
    "sluchátko": "objects",       # "earphone" is an object
    "orchestr": "misc",           # "orchestra" not body
    "žaloba": "misc",             # "(legal) action" not body
    "fotograf": "misc,people",    # "photographer" not objects
    "silvestr": "time",           # "New Year's Eve" is time
    "kadeřnictví": "places",      # "hair-stylist's" is a place
    "farmář": "misc,people",      # "farmer" not body
    "farmářka": "misc,people",    # "farmer" not body
    "zemědělec": "misc,people",   # "farmer" not body
    "bačkory": "objects",         # "slippers" not body
    "farma": "places",            # "farm" not body
    "oteplování": "nature",       # "warming" not body
    "statk": "places",            # "farm" not body
    "zemětřesení": "nature",      # "earthquake" not body
    "angína": "body",             # keep - sore throat
    "žaludk": "body",             # keep - stomach
    "účes": "body",               # keep - haircut
    "legenda": "misc",            # "legend" not body
    "pověst": "misc",             # "legend" not body

    # === More time miscategorizations ===
    "garáž": "places",            # "garage" is a place
    "vztek": "misc,abstract",     # "rage" not time
    "poškození": "misc",          # "damage" not time
    "klec": "objects",            # "cage" not time
    "jeviště": "places",          # "stage" is a place
    "agent": "misc,people",       # "agent" not time
    "sdělení": "misc",            # "message" not time
    "dědictví": "misc",           # "heritage" not time
    "zápis": "misc",              # "minutes" not time
    "vzkaz": "misc",              # "message" not time
    "stadium": "misc",            # "stage" not time
    "pódium": "places",           # "stage" is a place
    "pasáž": "places",            # "passage" is a place
    "koláž": "misc",              # "collage" not time
    "tragédie": "misc,event",     # "tragedy" not time
    "hypotéka": "misc",           # "mortgage" not time
    "masáž": "body",              # "massage" not time
    "prodloužení": "misc",        # "extra time" not time
    "etapa": "misc",              # "period" not strictly time
    "maturita": "misc,event",     # "exam" not places

    # === More places miscategorizations ===
    "vysílání": "misc",           # "broadcast" not places
    "budování": "misc",           # "building (process)" not places
    "elektřina": "misc",          # "electricity" not places
    "nakladatelství": "places",   # keep - publishing house is a place
    "bankéř": "misc,people",      # "banker" not places
    "bankéřka": "misc,people",    # "banker" not places
    "makléř": "misc,people",      # "broker" not places
    "mrakodrap": "places",        # keep - skyscraper is a place
    "biskop": "misc,people",      # keep - not places
    "peněženka": "objects",       # "wallet" not places

    # === More transportation miscategorizations ===
    "šampionát": "misc,event",    # "championship" not transportation
    "zdravotnictví": "misc",      # "health care" not transportation
    "průkaz": "objects",          # "card" not transportation
    "planeta": "nature",          # "planet" not transportation
    "autíčko": "objects",         # "toy cars" not transportation
    "vstupenka": "objects",       # "ticket" not transportation
    "keř": "nature",              # "bush" not transportation

    # === More food miscategorizations ===
    "mužstvo": "misc",            # "team" not food
    "výuka": "misc",              # "teaching" not food
    "pára": "nature",             # "steam" not food
    "čajník": "objects",          # "teapot" not food

    # === More objects miscategorizations ===
    "reprezentace": "misc",       # "representation" not objects
    "sledování": "misc",          # "watching" not objects
    "prezentace": "misc",         # "presentation" not objects
    "nenávist": "misc,abstract",  # "hatred" not objects
    "zastoupení": "misc",         # "representation" not objects
    "reprezentant": "misc,people", # "representative" not objects
    "nezávislost": "misc,abstract", # "independence" not objects
    "vyrovnání": "misc",          # "compensation" not objects
    "úkor": "misc",               # "expense" not objects
    "náhrada": "misc",            # "compensation" not objects
    "důchodce": "misc,people",    # "pensioner" not objects
    "utrpení": "misc,abstract",   # "suffering" not objects
    "hlídka": "misc,people",      # "watch/patrol" not objects
    "otevření": "misc,event",     # "opening" not objects
    "hokej": "misc",              # "hockey" not objects

    # === More family miscategorizations ===
    "prodejce": "misc,people",    # "salesperson" not family
    "prodavač": "misc,people",    # "salesperson" not family
    "prodavačka": "misc,people",  # "salesperson" not family
    "vězeň": "misc,people",      # "prisoner" not family
    "věznice": "places",          # "prison" is a place
    "filmář/filmářka": "misc,people", # "film-person" not family
    "flegmatik": "misc,people",   # not family
    "cholerik": "misc,people",    # not family
    "melancholik": "misc,people", # not family
    "sangvinik": "misc,people",   # not family
    "bezdomovc": "misc,people",   # not family
    "podnikatel/podnikatelka": "misc,people", # not family
    "porovnání": "misc",          # "comparison" not family
    "plnění": "misc",             # "performance" not misc,people
    "plech": "objects",           # "baking tray" not misc,people
    "návod": "objects",           # "manual" not misc,people
    "hospodaření": "misc",        # "management" not misc,people
    "poptávka": "misc",           # "demand" not misc,people
    "vlastnictví": "misc",        # "ownership" not misc,people
    "manipulace": "misc",         # "manipulation" not misc,people
    "němčina": "misc",            # "German" not misc,people
    "výkonnost": "misc",          # "performance" not misc,people
    "chůze": "misc",              # "walking" not misc,people
    "magistrát": "places",        # "metropolitan authority" is a place
    "školka": "places",           # "nursery school" is a place
    "bojovník": "misc,people",    # "fighter" not misc,event
    "hasič": "misc,people",       # "firefighter" not misc,event
    "hasička": "misc,people",     # "firefighter" not misc,event
    "porodnice": "places",        # "maternity ward" is a place
    "hudebník": "misc,people",    # "musician" not misc,abstract
    "společník": "misc,people",   # "partner" not misc,abstract
    "nástupce": "misc,people",    # "successor" not misc,abstract
    "milenec": "misc,people",     # "lover" not misc,abstract
    "milovník": "misc,people",    # "lover" not misc,abstract
    "dodavatel": "misc,people",   # "supplier" not misc,abstract
    "posílení": "misc",           # "strengthening" not misc,abstract
    "odjezd": "misc",             # "departure" not misc,abstract
    "neúspěch": "misc",           # "failure" not misc,abstract
    "tušení": "misc",             # "feeling" not misc,abstract
    "trávník": "nature",          # "lawn" not misc,abstract
    "muzika": "misc",             # "music" not misc,abstract
    "stabilita": "misc",          # not misc,abstract
    "sedadlo": "objects",         # "seat" not nature
    "brigáda": "misc",            # "summer job" not nature
    "trénink": "misc",            # "training" not nature
    "choroba": "body",            # "disease" is body
    "biskup": "misc,people",      # "bishop" not places

    # === Misc/nature fixes in later entries ===
    "louka": "nature,places",     # "meadow" is nature
    "potok": "nature",            # "stream" is nature
    "jeskyně": "nature,places",   # "cave" is nature
    "rybník": "nature",           # "pond" is nature
    "oceán": "nature",            # "ocean" is nature
    "pláž": "nature,places",      # "beach" is nature
    "mráz": "nature",             # "frost" is nature
    "bouře": "nature",            # "storm" is nature
    "mlha": "nature",             # "mist" is nature
    "horko": "nature",            # "heat" is nature
    "chlad": "nature",            # "chill" is nature
    "oblak": "nature",            # "cloud" is nature
    "mrak": "nature",             # "cloud" is nature
    "vrch": "nature,places",      # "hill" is nature
    "terén": "nature",            # "terrain" is nature
    "svah": "nature",             # "slope" is nature
    "prales": "nature",           # "forest" is nature
    "sluníčko": "nature",         # "sun" is nature

    # === Food fixes in later entries ===
    "knedlík": "food",            # "dumpling" is food
    "buchta": "food",             # "cake" is food
    "dort": "food",               # "cake" is food
    "těsto": "food",              # "dough" is food
    "omáčka": "food",             # "sauce" is food
    "koláč": "food",              # "cake" is food
    "salát": "food",              # "salad" is food
    "šťáva": "food",              # "juice" is food
    "čokoláda": "food",           # "chocolate" is food
    "nápoj": "food",              # "drink" is food
    "potrava": "food",            # "food" is food
    "vajíčko": "food",            # "egg" is food
    "mouka": "food",              # "flour" is food
    "strava": "food",             # "food" is food
    "řízek": "food",              # "schnitzel" is food
    "cibule": "food",             # "onion" is food
    "plod": "food,nature",        # "fruit" is food/nature

    # === Animals fixes ===
    "slepice": "animals",         # "hen" is animal
    "moucha": "animals",          # "fly" is animal
    "had": "animals",             # "snake" is animal
    "medvěd": "animals",          # "bear" is animal
    "lev": "animals",             # "lion" is animal
    "hmyz": "animals",            # "insect" is animals
    "živočich": "animals",        # "animal" is animals
    "myš": "animals",             # "mouse" is animals
    "ocas": "animals",            # "tail" is animals
    "prase": "animals",           # "pig" is animals
    "krtek": "animals",           # "mole" is animals
    "ježk": "animals",            # "hedgehog" is animals
    "křečk": "animals",           # "hamster" is animals
    "zajíc": "animals",           # "hare" is animals
    "vlk": "animals",             # "wolf" is animals
    "slon": "animals",            # "elephant" is animals
    "velbloud": "animals",        # "camel" is animals
    "koza": "animals",            # "goat" is animals
    "pudl": "animals",            # "poodle" is animals
    "drak": "misc",               # "dragon" is misc (mythical)

    # === Body fixes ===
    "hruď": "body",               # "chest" is body
    "páteř": "body",              # "backbone" is body
    "stehno": "body",             # "thigh" is body
    "loket": "body",              # "elbow" is body
    "pata": "body",               # "heel" is body
    "lebka": "body",              # "skull" is body
    "žíla": "body",               # "vein" is body
    "obočí": "body",              # "eyebrow" is body
    "sval": "body",               # "muscle" is body
    "hřbet": "body",              # "back" is body
    "zadek": "body",              # "back" is body
    "nehet": "body",              # "nail" is body
    "brada": "body",              # "chin" is body
    "pleť": "body",               # "complexion" is body
    "náruč": "body",              # "arms" is body
    "huba": "body",               # "mouth" is body
    "palec": "body",              # "thumb" is body
    "pěst": "body",               # "fist" is body
    "kloub": "body",              # "joint" is body
    "plíce": "body",              # "lung" is body
    "únava": "body",              # "weariness" is body
    "horečka": "body",            # "fever" is body

    # === Places fixes in later entries ===
    "metro": "transportation",    # "tube" is transportation
    "člun": "transportation",     # "boat" is transportation
    "obývák": "places",           # "living room" is places
    "venkov": "places",           # "country" is places
    "balkón": "places",           # "balcony" is places
    "stadión": "places",          # "stadium" is places
    "bazén": "places",            # "swimming pool" is places
    "tunel": "places",            # "tunnel" is places
    "redakce": "places",          # "editorial office" is places
    "prodejna": "places",         # "shop" is places
    "stánek": "places",           # "stall" is places
    "chrám": "places",            # "temple" is places
    "pevnost": "places",          # "fortress" is places
    "klášter": "places",          # "monastery" is places
    "schodiště": "places",        # "staircase" is places
    "lavička": "places",          # "bench" is places (in a park)
    "pobočka": "places",          # "branch (office)" is places
    "vila": "places",             # "villa" is places
    "továrna": "places",          # "factory" is places
    "jídelna": "places",          # "dining room" is places
    "lednička": "objects",         # "fridge" is objects
    "sprcha": "objects",           # "shower" is objects (fixture)
    "vana": "objects",             # "bath" is objects (fixture)
    "deka": "objects",             # "blanket" is objects

    # === Objects fixes ===
    "ponožka": "objects",          # "sock" is objects
    "sukně": "objects",            # "skirt" is objects
    "sako": "objects",             # "jacket" is objects
    "kabát": "objects",            # "coat" is objects
    "bunda": "objects",            # "jacket" is objects
    "oblek": "objects",            # "suit" is objects
    "uniforma": "objects",         # "uniform" is objects
    "maska": "objects",            # "mask" is objects
    "kufr": "objects",             # "suitcase" is objects
    "pistole": "objects",          # "gun" is objects
    "bomba": "objects",            # "bomb" is objects
    "polštář": "objects",          # "pillow" is objects
    "lžíce": "objects",            # "spoon" is objects
    "talíř": "objects",            # "plate" is objects
    "kostka": "objects",           # "cube" is objects
    "tričko": "objects",           # "T-shirt" is objects
    "čepice": "objects",           # "cap" is objects
    "rukavice": "objects",         # "glove" is objects
    "klobouk": "objects",          # "hat" is objects
    "svíčka": "objects",           # "candle" is objects
    "hračka": "objects",           # "toy" is objects
    "míč": "objects",              # "ball" is objects
    "flaška": "objects",           # "bottle" is objects
    "váza": "objects",             # "vase" is objects
    "koule": "objects",            # "ball" is objects
    "slovník": "objects",          # "dictionary" is objects
    "balík": "objects",            # "parcel" is objects
    "balíček": "objects",          # "packet" is objects
    "páska": "objects",            # "tape" is objects
    "lyže": "objects",             # "ski" is objects
    "tabule": "objects",           # "board" is objects
    "plakát": "objects",           # "poster" is objects
    "kalendář": "objects",         # "calendar" is objects

    # === Family fixes ===
    "ségra": "family,people",     # "sister" is family
    "strejda": "family,people",   # "uncle" is family
    "dědek": "family,people",     # "geezer/grandpa" is family
    "sourozenci": "family",       # "siblings" is family
    "prarodiče": "family",        # "grandparents" is family
    "vrah": "misc,people",        # "murderer" is people not misc
    "pachatel": "misc,people",    # "offender" is people
    "blbec": "misc,people",       # "moron" is people
}

# ─── DIFFICULTY RECLASSIFICATION ───
# Words that should be DEMOTED from A1 to A2 (not beginner vocabulary)

DEMOTE_TO_A2: set[str] = {
    # Abstract/political/legal/academic terms
    "analýza", "demokracie", "existence", "dispozice", "blízkost",
    "areál", "tendence", "mechanismus", "koncepce", "problematika",
    "soulad", "podstata", "subjekt", "struktura", "rámec",
    "princip", "prvek", "pojem", "teorie", "kategorie",
    "fáze", "celek", "aspekt", "perspektiva", "definice",
    "kritérium", "strategie", "koncept", "logika",

    # Political/government terms
    "republika", "parlament", "ministerstvo", "unie", "komise",
    "ústav", "poslanec", "komunista", "revoluce", "politika",
    "ministr", "prezident", "vláda", "kandidát", "předseda",
    "starosta", "premiér", "občan",

    # Legal/institutional terms
    "zákon", "právo", "soud", "smlouva", "předpis",
    "instituce", "organizace", "podmínka", "proces",
    "realizace", "regulace",

    # Financial/business terms
    "investice", "rozpočet", "ekonomika", "hodnota", "fond",
    "podíl", "účel", "daň", "částka", "produkce",
    "výroba", "investor", "dolar", "euro",

    # Academic/formal terms
    "výzkum", "metoda", "faktor", "efekt", "model",
    "funkce", "systém", "typ", "forma", "role",
    "vliv", "účinek", "norma", "standard",
    "technologie", "technika",

    # Abstract nouns that A1 students wouldn't need
    "podstata", "souvislost", "důsledek", "okolnost", "rozsah",
    "činnost", "schopnost", "vlastnost", "skutečnost",
    "povinnost", "odpovědnost", "závislost", "nutnost",
    "platnost", "bezpečnost", "vzdálenost",
    "záležitost", "příležitost",

    # Formal/literary vocabulary
    "projev", "ohled", "postup", "postavení", "působení",
    "opatření", "řízení", "využití", "použití", "omezení",
    "označení", "zvýšení", "snížení", "vytvoření", "rozšíření",
    "zajištění", "vyjádření", "hodnocení", "rozhodnutí",
    "očekávání", "přijetí",

    # Less common / more advanced
    "rovina", "průzkum", "poznání", "úmysl", "motiv",
    "signál", "kapacita", "záznam", "znamení", "provedení",
    "průběh", "podoba", "součást", "vedení", "řešení",
    "správa", "řád", "zásada", "vznik", "nárok",
    "výjimka", "podpora", "vrstva", "orgán", "objekt",
    "dohoda", "vůle", "příjem", "soubor", "překvapení",
    "rekonstrukce", "pojetí", "tendence", "výzva",
    "rozpor", "kampaň", "spotřeba", "konstrukce",
    "náhoda", "tvorba", "účast", "předpoklad",
    "vazba", "obrana",

    # Military terms
    "armáda", "zbraň", "voják", "útok", "boj",

    # Words with very specific/niche meanings
    "hledisko", "stránka", "množství", "prvek",
    "zdroj", "postup", "prostor", "prostředek",
    "prostředí", "úroveň", "míra", "stupeň",
    "směr", "druh", "úprava", "stav",
    "zájem", "základ", "výsledek", "pohled",

    # More abstract vocabulary
    "údaj", "podnik", "provoz", "akce",
    "přístup", "návrh", "výkon", "volba",
    "řízení", "závěr", "průběh",

    # Verbalizations that are advanced
    "zpracování", "jednání", "chování", "setkání",
    "oddělení", "sdružení", "hnutí",
    "podezření", "vysvětlení", "prohlášení",
    "spojení", "vystoupení",

    # Not everyday A1 words
    "existence", "tradice", "generace", "komunikace",
    "operace", "reakce", "informace", "situace",
    "konstrukce",

    "požadavek", "náklad", "příspěvek", "nedostatek",
    "celek", "přehled", "odhad", "pokles", "dopad",
    "argument", "podnět",
}

# Words that should be PROMOTED from A2 to A1 (basic everyday vocabulary)
PROMOTE_TO_A1: set[str] = {
    # Basic everyday items
    "sešit", "pero", "tužka", "košile", "kabelka",
    # Basic food
    "sýr", "máslo", "vejce", "jablko",
    # Basic family
    "dědeček", "strýc", "přítelkyně",
    # Basic places
    "kavárna", "místnost", "hrad", "věž",
    # Basic nature
    "strom", "květ", "jezero", "obloha", "růže",
    # Basic concepts a beginner would know
    "věc", "láska", "odpověď", "štěstí", "život",
    "svoboda",
    # Basic transport
    "tramvaj",
    # Animals
    "kuře", "kůň", "zvíře", "kráva",
    # Other basic
    "ústa",
    # Body
    "prst",
    # Basic A1 words that were A2
    "klid", "domov",
    "procházka", "počasí", "déšť",
    "nemoc",
    "nálada",
}

# ─── WORDS TO PRUNE ───
# Niche/specialized vocabulary that no student would need
# (Only prune if NOT in KzK2)

WORDS_TO_PRUNE: set[str] = {
    # These are extremely niche or English loanwords that don't add value
    # We'll be conservative - only remove truly useless ones
    # Checked: none of these are in KzK2
}

# Actually, let's not prune any words proactively - the user said "be conservative"
# We'll only flag words that MorphoDiTa can't handle (those will fail in build anyway)


def load_csv() -> list[dict[str, str]]:
    rows = []
    with open(META_CSV, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    return rows


def save_csv(rows: list[dict[str, str]]) -> None:
    fieldnames = ["lemma", "translation", "paradigm", "difficulty", "categories"]
    with open(META_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def load_lemmas() -> list[str]:
    lines = []
    with open(LEMMAS_TXT, encoding="utf-8") as f:
        for line in f:
            lines.append(line.rstrip("\n"))
    return lines


def save_lemmas(lines: list[str]) -> None:
    with open(LEMMAS_TXT, "w", encoding="utf-8") as f:
        for line in lines:
            f.write(line + "\n")


def fix_categories(rows: list[dict[str, str]]) -> int:
    """Fix miscategorized words. Returns count of changes."""
    changes = 0
    for row in rows:
        lemma = row["lemma"]
        if lemma in CATEGORY_OVERRIDES:
            old_cats = row["categories"]
            new_cats = CATEGORY_OVERRIDES[lemma]
            if old_cats != new_cats:
                row["categories"] = new_cats
                changes += 1
                print(f"  CAT: {lemma}: '{old_cats}' -> '{new_cats}'")
    return changes


def fix_difficulty(rows: list[dict[str, str]]) -> tuple[int, int]:
    """Fix A1/A2 difficulty levels. Returns (demoted, promoted) counts."""
    demoted = 0
    promoted = 0
    for row in rows:
        lemma = row["lemma"]
        old_diff = row["difficulty"]

        if lemma in DEMOTE_TO_A2 and old_diff == "A1":
            row["difficulty"] = "A2"
            demoted += 1
            print(f"  DEMOTE: {lemma} ({row['translation']}) A1 -> A2")

        if lemma in PROMOTE_TO_A1 and old_diff in ("A2", "B1"):
            row["difficulty"] = "A1"
            promoted += 1
            print(f"  PROMOTE: {lemma} ({row['translation']}) {old_diff} -> A1")

    return demoted, promoted


def prune_words(rows: list[dict[str, str]], lemma_lines: list[str]) -> tuple[list[dict[str, str]], list[str], int]:
    """Remove low-value words (only if not in KzK2). Returns updated rows, lines, count."""
    pruned = 0
    if not WORDS_TO_PRUNE:
        return rows, lemma_lines, 0

    to_prune = WORDS_TO_PRUNE - KZK2_LEMMAS  # Never prune KzK2 words
    new_rows = []
    for row in rows:
        if row["lemma"] in to_prune:
            pruned += 1
            print(f"  PRUNE: {row['lemma']} ({row['translation']})")
        else:
            new_rows.append(row)

    new_lines = []
    for line in lemma_lines:
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and stripped.lower() in to_prune:
            continue
        new_lines.append(line)

    return new_rows, new_lines, pruned


def main() -> int:
    print("=== Word Bank Audit ===\n")

    rows = load_csv()
    lemma_lines = load_lemmas()

    # Count before
    a1_before = sum(1 for r in rows if r["difficulty"] == "A1")
    a2_before = sum(1 for r in rows if r["difficulty"] == "A2")
    b1_before = sum(1 for r in rows if r["difficulty"] == "B1")

    print(f"Before: {len(rows)} words ({a1_before} A1, {a2_before} A2, {b1_before} B1)\n")

    # 1. Fix categories
    print("--- Fixing categories ---")
    cat_changes = fix_categories(rows)
    print(f"  Total category fixes: {cat_changes}\n")

    # 2. Fix difficulty
    print("--- Fixing difficulty levels ---")
    demoted, promoted = fix_difficulty(rows)
    print(f"  Demoted to A2: {demoted}")
    print(f"  Promoted to A1: {promoted}\n")

    # 3. Prune words
    print("--- Pruning low-value words ---")
    rows, lemma_lines, pruned = prune_words(rows, lemma_lines)
    print(f"  Pruned: {pruned}\n")

    # Count after
    a1_after = sum(1 for r in rows if r["difficulty"] == "A1")
    a2_after = sum(1 for r in rows if r["difficulty"] == "A2")
    b1_after = sum(1 for r in rows if r["difficulty"] == "B1")

    print(f"After: {len(rows)} words ({a1_after} A1, {a2_after} A2, {b1_after} B1)")
    print(f"A1 target: 400-600, actual: {a1_after}")

    # Save
    save_csv(rows)
    save_lemmas(lemma_lines)
    print(f"\nSaved {META_CSV}")
    print(f"Saved {LEMMAS_TXT}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
