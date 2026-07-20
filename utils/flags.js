// Mirrors cloth_config_editor/src/utils/flags.js so production reports can
// resolve a design_config's flag name (e.g. "Australia") to a public image
// URL. Only entries with a public CDN URL are linkable — the local-only
// specials (EU, Tamil Eelam, Kashmir) have no public URL to link to.

const COUNTRY_CODES = [
    ["Afghanistan", "af"], ["Albania", "al"], ["Algeria", "dz"], ["Argentina", "ar"],
    ["Australia", "au"], ["Austria", "at"], ["Bangladesh", "bd"], ["Belgium", "be"],
    ["Brazil", "br"], ["Bulgaria", "bg"], ["Canada", "ca"], ["Chile", "cl"],
    ["China", "cn"], ["Colombia", "co"], ["Croatia", "hr"], ["Czech Republic", "cz"],
    ["Denmark", "dk"], ["Egypt", "eg"], ["Estonia", "ee"], ["Ethiopia", "et"],
    ["Finland", "fi"], ["France", "fr"], ["Germany", "de"], ["Ghana", "gh"],
    ["Greece", "gr"], ["Hungary", "hu"], ["Iceland", "is"], ["India", "in"],
    ["Indonesia", "id"], ["Iran", "ir"], ["Iraq", "iq"], ["Ireland", "ie"],
    ["Israel", "il"], ["Italy", "it"], ["Japan", "jp"], ["Jordan", "jo"],
    ["Kenya", "ke"], ["Latvia", "lv"], ["Lebanon", "lb"], ["Lithuania", "lt"],
    ["Malaysia", "my"], ["Mexico", "mx"], ["Morocco", "ma"], ["Netherlands", "nl"],
    ["New Zealand", "nz"], ["Nigeria", "ng"], ["North Korea", "kp"], ["Norway", "no"],
    ["Pakistan", "pk"], ["Palestine", "ps"], ["Peru", "pe"], ["Philippines", "ph"],
    ["Poland", "pl"], ["Portugal", "pt"], ["Romania", "ro"], ["Russia", "ru"],
    ["Saudi Arabia", "sa"], ["Serbia", "rs"], ["Slovakia", "sk"], ["Slovenia", "si"],
    ["Somalia", "so"], ["South Africa", "za"], ["South Korea", "kr"], ["Spain", "es"],
    ["Sri Lanka", "lk"], ["Sweden", "se"], ["Switzerland", "ch"], ["Syria", "sy"],
    ["Thailand", "th"], ["Tunisia", "tn"], ["Turkey", "tr"], ["Ukraine", "ua"],
    ["United Arab Emirates", "ae"], ["United Kingdom", "gb"], ["United States", "us"],
    ["Venezuela", "ve"], ["Vietnam", "vn"], ["Yemen", "ye"],
];

const FLAG_URL_BY_NAME = new Map(
    COUNTRY_CODES.map(([name, code]) => [name.toLowerCase(), `https://flagcdn.com/w320/${code}.png`])
);

// Special/regional flags that have a public CDN URL (unlike EU/Tamil Eelam/Kashmir,
// which only exist as local frontend assets and can't be linked from a report).
[
    ["Scotland", "gb-sct"],
    ["Wales", "gb-wls"],
    ["Faroe Islands", "fo"],
    ["Greenland", "gl"],
].forEach(([name, code]) => FLAG_URL_BY_NAME.set(name.toLowerCase(), `https://flagcdn.com/w320/${code}.png`));

export const getFlagUrl = (name) => {
    if (!name) return null;
    return FLAG_URL_BY_NAME.get(String(name).toLowerCase().trim()) || null;
};
