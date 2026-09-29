# Country codes (site codes) — synthetic fixture

A **site** is one independent website inside one Foundation repository: its own pages, its own
languages, its own navigation and, when it needs them, its own regional offices. Every site is named
by a **site code**, and that code is the *first* piece of every address the site serves.

This document belongs to the **synthetic test deployment** (`tests/fixtures/synthetic-deployment`).
It is not a real site's documentation: it exists so the generic Foundation suite can exercise the
deployment-owned generated-document lifecycle — reading, validating and regenerating a marked section
— without depending on, or touching, any real deployment.

Do not edit the marked section below by hand. It is generated from the runtime authority
(`src/core/site-code.ts`):

```bash
pnpm country-codes:sync     # regenerate the marked section
pnpm country-codes:check    # verify only — fails when the two disagree
```

The prose outside the markers belongs to the deployment and is never rewritten.

<!-- CODES:START -->

`ad` Andorra · `gl` Greenland · `no` Norway
`ae` United Arab Emirates · `gm` Gambia · `np` Nepal
`af` Afghanistan · `gn` Guinea · `nr` Nauru
`ag` Antigua & Barbuda · `gp` Guadeloupe · `nu` Niue
`ai` Anguilla · `gq` Equatorial Guinea · `nz` New Zealand
`al` Albania · `gr` Greece · `om` Oman
`am` Armenia · `gs` South Georgia & South Sandwich Islands · `pa` Panama
`ao` Angola · `gt` Guatemala · `pe` Peru
`aq` Antarctica · `gu` Guam · `pf` French Polynesia
`ar` Argentina · `gw` Guinea-Bissau · `pg` Papua New Guinea
`as` American Samoa · `gy` Guyana · `ph` Philippines
`at` Austria · `hk` Hong Kong SAR China · `pk` Pakistan
`au` Australia · `hm` Heard & McDonald Islands · `pl` Poland
`aw` Aruba · `hn` Honduras · `pm` St. Pierre & Miquelon
`ax` Åland Islands · `hr` Croatia · `pn` Pitcairn Islands
`az` Azerbaijan · `ht` Haiti · `pr` Puerto Rico
`ba` Bosnia & Herzegovina · `hu` Hungary · `ps` Palestinian Territories
`bb` Barbados · `id` Indonesia · `pt` Portugal
`bd` Bangladesh · `ie` Ireland · `pw` Palau
`be` Belgium · `il` Israel · `py` Paraguay
`bf` Burkina Faso · `im` Isle of Man · `qa` Qatar
`bg` Bulgaria · `in` India · `re` Réunion
`bh` Bahrain · `io` British Indian Ocean Territory · `ro` Romania
`bi` Burundi · `iq` Iraq · `rs` Serbia
`bj` Benin · `ir` Iran · `ru` Russia
`bl` St. Barthélemy · `is` Iceland · `rw` Rwanda
`bm` Bermuda · `it` Italy · `sa` Saudi Arabia
`bn` Brunei · `je` Jersey · `sb` Solomon Islands
`bo` Bolivia · `jm` Jamaica · `sc` Seychelles
`bq` Caribbean Netherlands · `jo` Jordan · `sd` Sudan
`br` Brazil · `jp` Japan · `se` Sweden
`bs` Bahamas · `ke` Kenya · `sg` Singapore
`bt` Bhutan · `kg` Kyrgyzstan · `sh` St. Helena
`bv` Bouvet Island · `kh` Cambodia · `si` Slovenia
`bw` Botswana · `ki` Kiribati · `sj` Svalbard & Jan Mayen
`by` Belarus · `km` Comoros · `sk` Slovakia
`bz` Belize · `kn` St. Kitts & Nevis · `sl` Sierra Leone
`ca` Canada · `kp` North Korea · `sm` San Marino
`cc` Cocos (Keeling) Islands · `kr` South Korea · `sn` Senegal
`cd` Congo - Kinshasa · `kw` Kuwait · `so` Somalia
`cf` Central African Republic · `ky` Cayman Islands · `sr` Suriname
`cg` Congo - Brazzaville · `kz` Kazakhstan · `ss` South Sudan
`ch` Switzerland · `la` Laos · `st` São Tomé & Príncipe
`ci` Côte d’Ivoire · `lb` Lebanon · `sv` El Salvador
`ck` Cook Islands · `lc` St. Lucia · `sx` Sint Maarten
`cl` Chile · `li` Liechtenstein · `sy` Syria
`cm` Cameroon · `lk` Sri Lanka · `sz` Eswatini
`cn` China · `lr` Liberia · `tc` Turks & Caicos Islands
`co` Colombia · `ls` Lesotho · `td` Chad
`cr` Costa Rica · `lt` Lithuania · `tf` French Southern Territories
`cu` Cuba · `lu` Luxembourg · `tg` Togo
`cv` Cape Verde · `lv` Latvia · `th` Thailand
`cw` Curaçao · `ly` Libya · `tj` Tajikistan
`cx` Christmas Island · `ma` Morocco · `tk` Tokelau
`cy` Cyprus · `mc` Monaco · `tl` Timor-Leste
`cz` Czechia · `md` Moldova · `tm` Turkmenistan
`de` Germany · `me` Montenegro · `tn` Tunisia
`dj` Djibouti · `mf` St. Martin · `to` Tonga
`dk` Denmark · `mg` Madagascar · `tr` Türkiye
`dm` Dominica · `mh` Marshall Islands · `tt` Trinidad & Tobago
`do` Dominican Republic · `mk` North Macedonia · `tv` Tuvalu
`dz` Algeria · `ml` Mali · `tw` Taiwan
`ec` Ecuador · `mm` Myanmar (Burma) · `tz` Tanzania
`ee` Estonia · `mn` Mongolia · `ua` Ukraine
`eg` Egypt · `mo` Macao SAR China · `ug` Uganda
`eh` Western Sahara · `mp` Northern Mariana Islands · `um` U.S. Outlying Islands
`er` Eritrea · `mq` Martinique · `us` United States
`es` Spain · `mr` Mauritania · `uy` Uruguay
`et` Ethiopia · `ms` Montserrat · `uz` Uzbekistan
`fi` Finland · `mt` Malta · `va` Vatican City
`fj` Fiji · `mu` Mauritius · `vc` St. Vincent & Grenadines
`fk` Falkland Islands · `mv` Maldives · `ve` Venezuela
`fm` Micronesia · `mw` Malawi · `vg` British Virgin Islands
`fo` Faroe Islands · `mx` Mexico · `vi` U.S. Virgin Islands
`fr` France · `my` Malaysia · `vn` Vietnam
`ga` Gabon · `mz` Mozambique · `vu` Vanuatu
`gb` United Kingdom · `na` Namibia · `wf` Wallis & Futuna
`gd` Grenada · `nc` New Caledonia · `ws` Samoa
`ge` Georgia · `ne` Niger · `ye` Yemen
`gf` French Guiana · `nf` Norfolk Island · `yt` Mayotte
`gg` Guernsey · `ng` Nigeria · `za` South Africa
`gh` Ghana · `ni` Nicaragua · `zm` Zambia
`gi` Gibraltar · `nl` Netherlands · `zw` Zimbabwe

<!-- CODES:END -->
