// ─── Keyword Engine ───────────────────────────────────────────────────────────
// Canonical types, interfaces, constants, and keyword dataset.
// Import from here in any page that needs keyword data or related types.

// ─── Primitive types ──────────────────────────────────────────────────────────

export type Action              = "Buy" | "Test" | "No";
export type Country             = "Singapore" | "Malaysia" | "Vietnam" | "Thailand";
export type Intent              = "Informational" | "Commercial" | "Transactional" | "Navigational";
export type Competition         = "Low" | "Medium" | "High";
export type MatchType           = "Broad" | "Phrase" | "Exact";
export type CompetitorPressure  = "Low" | "Medium" | "High";
export type AdCrowdingLevel     = "Low" | "Medium" | "High";
export type CompetitiveDifficulty = "Easy" | "Moderate" | "Hard";
export type PriorityLevel       = "High Priority" | "Test Market" | "Low Priority";

// ─── Interfaces ───────────────────────────────────────────────────────────────

/** Static fields sourced from keyword research — never computed. */
export interface Keyword {
  id: number;
  keyword: string;
  country: Country;
  intent: Intent;
  monthlySearches: number;
  competition: Competition;
  estimatedCpc: number;           // Market benchmark CPC
  suggestedCpc: number;           // Recommended bid
  matchType: MatchType;
  opportunityScore: number;       // 0–100
  action: Action;
  competitorPressure: CompetitorPressure;
  competitorPressureScore: number; // 0–100 numeric intensity
  adCrowdingLevel: AdCrowdingLevel;
  competitiveDifficulty: CompetitiveDifficulty;
  competitorExamples: string[];
  strategyNote: string;           // Competitor-aware strategy advice
  recommendationNote: string;     // Budget / bid rationale
}

/** Per-keyword fields computed from project assumptions + budget allocation. */
export interface EnrichedKeyword extends Keyword {
  suggestedMonthlyBudget: number;
  estimatedClicks: number;
  estimatedLeads: number;
  estimatedCpl: number;
  revenuePotential: number;
  roas: number;
  // Extended forecast fields populated by the upgraded engine
  estimatedImpressions?: number;
  estimatedPosition?: number;
  impressionShare?: number;
  confidenceLevel?: "High" | "Medium" | "Low";
  effectiveCpcFinal?: number;
  estimatedCtr?: number;
  estimatedCvr?: number;
}

/** Country-level aggregation produced by buildCountryForecasts(). */
export interface CountryForecast {
  country: string;
  budget: number;
  buyBudget: number;
  testBudget: number;
  clicks: number;
  leads: number;
  cpl: number;
  sql: number;
  deals: number;
  revenue: number;
  priority: PriorityLevel;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const KEYWORD_COUNTRIES = ["Singapore", "Malaysia", "Vietnam", "Thailand", "Indonesia"] as const;

/** Default fraction of leads that qualify as Sales Qualified Leads. */
export const SQL_RATE = 0.5;

// ─── Canonical keyword dataset ────────────────────────────────────────────────

export const KEYWORDS: Keyword[] = [
  // ── Singapore ──────────────────────────────────────────────────────────────
  {
    id: 1, keyword: "executive search firm Singapore",
    country: "Singapore", intent: "Commercial", monthlySearches: 1900,
    competition: "High", estimatedCpc: 8.40, suggestedCpc: 9.20,
    matchType: "Exact", opportunityScore: 87, action: "Buy",
    competitorPressure: "High", competitorPressureScore: 82,
    adCrowdingLevel: "High", competitiveDifficulty: "Hard",
    competitorExamples: ["Michael Page", "Hays", "Robert Half"],
    strategyNote: "Outbid Michael Page and Hays with tightly worded RSAs. Lead with regional specialisation and C-suite placement credibility. Exact match essential — broad will burn budget against big-brand quality scores.",
    recommendationNote: "High commercial intent with strong brand-fit. Exact match limits wasted spend. Competitive but justifiable given deal value.",
  },
  {
    id: 2, keyword: "recruitment agency Singapore",
    country: "Singapore", intent: "Commercial", monthlySearches: 5400,
    competition: "High", estimatedCpc: 7.20, suggestedCpc: 7.80,
    matchType: "Phrase", opportunityScore: 82, action: "Buy",
    competitorPressure: "High", competitorPressureScore: 88,
    adCrowdingLevel: "High", competitiveDifficulty: "Hard",
    competitorExamples: ["Manpower", "Kelly Services", "Adecco SG"],
    strategyNote: "Most contested keyword in the portfolio. Compete on ad quality score, not just bid. Differentiate via same-day response SLA and niche verticals. Expect $8–10 effective CPC at auction.",
    recommendationNote: "Highest volume in market. Phrase match captures intent variance. Bid competitively — this is a market-share keyword.",
  },
  {
    id: 3, keyword: "HR consulting services Singapore",
    country: "Singapore", intent: "Commercial", monthlySearches: 1300,
    competition: "Medium", estimatedCpc: 5.80, suggestedCpc: 6.20,
    matchType: "Exact", opportunityScore: 78, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 55,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Mercer", "Aon Hewitt", "Willis Towers Watson"],
    strategyNote: "Mercer and Aon dominate organic; you can win paid share with focused ad copy. Target HR directors, not generalist searchers. Add sitelink extensions for EOR and staffing sub-services.",
    recommendationNote: "Mid-funnel commercial query with moderate CPC. Strong overlap with EOR and HR outsourcing buyer profile.",
  },
  {
    id: 4, keyword: "employer of record Singapore",
    country: "Singapore", intent: "Transactional", monthlySearches: 880,
    competition: "Medium", estimatedCpc: 9.10, suggestedCpc: 9.80,
    matchType: "Exact", opportunityScore: 91, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 62,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Deel", "Remote.com", "Atlas HXM"],
    strategyNote: "Deel and Remote.com run heavy paid campaigns. Counter with local compliance messaging and SG-specific regulatory expertise. Emphasise faster entity setup timelines in ad extensions.",
    recommendationNote: "Transactional query with high close probability. EOR is a high-ACV service — CPL is well within acceptable range.",
  },
  {
    id: 5, keyword: "EOR services Singapore",
    country: "Singapore", intent: "Transactional", monthlySearches: 590,
    competition: "Low", estimatedCpc: 6.50, suggestedCpc: 7.00,
    matchType: "Exact", opportunityScore: 88, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 28,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Papaya Global", "Velocity Global"],
    strategyNote: "Thin competitor presence — first-mover advantage available now. Own the keyword before global EOR players scale Singapore campaigns. Straightforward bid strategy works; no need for aggressive defensive bidding.",
    recommendationNote: "Low competition with clear transactional intent. Best CPL in SG market. Priority keyword for EOR service line.",
  },
  {
    id: 6, keyword: "staffing solutions Singapore",
    country: "Singapore", intent: "Commercial", monthlySearches: 2100,
    competition: "High", estimatedCpc: 6.90, suggestedCpc: 7.20,
    matchType: "Broad", opportunityScore: 74, action: "Test",
    competitorPressure: "High", competitorPressureScore: 78,
    adCrowdingLevel: "High", competitiveDifficulty: "Hard",
    competitorExamples: ["Randstad", "Manpower SG", "Persolkelly"],
    strategyNote: "Extremely crowded broad match auction. Randstad and Manpower have deep quality scores built over years. Negative keywords are critical — exclude 'jobs', 'career', 'salary'. Consider switching to Phrase to reduce auction noise.",
    recommendationNote: "Broad match in a saturated market risks irrelevant clicks. Run for 30 days with tight negative keyword list before scaling.",
  },
  {
    id: 7, keyword: "job redesign consultant Singapore",
    country: "Singapore", intent: "Informational", monthlySearches: 320,
    competition: "Low", estimatedCpc: 3.20, suggestedCpc: 3.50,
    matchType: "Exact", opportunityScore: 69, action: "No",
    competitorPressure: "Low", competitorPressureScore: 18,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["WSG Singapore", "e2i"],
    strategyNote: "Government-adjacent query dominated by WSG. You'll face a credibility gap even with easy paid access. Not worth paid spend at any price — redirect budget to transactional EOR and executive search terms.",
    recommendationNote: "Informational intent — searchers seek knowledge, not services. Low volume and near-zero conversion expected. Use for content strategy instead.",
  },
  {
    id: 8, keyword: "C-suite recruitment Singapore",
    country: "Singapore", intent: "Commercial", monthlySearches: 480,
    competition: "Medium", estimatedCpc: 11.50, suggestedCpc: 12.50,
    matchType: "Exact", opportunityScore: 93, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 58,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Spencer Stuart", "Egon Zehnder", "Korn Ferry"],
    strategyNote: "Spencer Stuart and Egon Zehnder own organic; you can win paid with speed and accessibility messaging. Win on being a boutique with genuine SE Asia C-suite networks. Low impression share opportunity — go for top-of-page bid.",
    recommendationNote: "Highest opportunity score in portfolio. Low volume but extremely high buyer intent. One closed deal easily justifies annual spend.",
  },
  {
    id: 9, keyword: "hire contract staff Singapore",
    country: "Singapore", intent: "Transactional", monthlySearches: 720,
    competition: "Medium", estimatedCpc: 5.30, suggestedCpc: 5.70,
    matchType: "Phrase", opportunityScore: 76, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 52,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Stafflink", "Achieve Group"],
    strategyNote: "Stafflink and local agencies compete here on price. Win with faster placement SLA copy and compliance guarantees. Phrase match captures high-intent variants like 'hire contract staff urgently' — include these in ad messaging.",
    recommendationNote: "Clear hire intent at reasonable CPC. Phrase match captures related variants. Solid supporting keyword for contract staffing service.",
  },
  {
    id: 10, keyword: "workforce planning Singapore",
    country: "Singapore", intent: "Informational", monthlySearches: 860,
    competition: "Low", estimatedCpc: 2.90, suggestedCpc: 3.00,
    matchType: "Broad", opportunityScore: 61, action: "No",
    competitorPressure: "Low", competitorPressureScore: 22,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Mercer", "Korn Ferry Consulting"],
    strategyNote: "Near-zero paid competition but conversion rate will be negligible. Broad match + informational intent means most clicks go nowhere. If used at all, layer RLSA to retarget engaged site visitors only — do not run cold.",
    recommendationNote: "Informational + broad match = high traffic risk with low conversion. Better suited for organic SEO or remarketing audiences.",
  },

  // ── Malaysia ───────────────────────────────────────────────────────────────
  {
    id: 11, keyword: "recruitment agency Kuala Lumpur",
    country: "Malaysia", intent: "Commercial", monthlySearches: 3600,
    competition: "High", estimatedCpc: 3.80, suggestedCpc: 4.10,
    matchType: "Phrase", opportunityScore: 79, action: "Buy",
    competitorPressure: "High", competitorPressureScore: 76,
    adCrowdingLevel: "High", competitiveDifficulty: "Hard",
    competitorExamples: ["Randstad MY", "Michael Page MY", "JobStreet"],
    strategyNote: "JobStreet dominates brand recall; compete on paid specialisation and placement speed. KL market is price-sensitive — call out mid-market pricing advantage. Geo-target within Klang Valley to improve relevance score and reduce wasted impressions.",
    recommendationNote: "Highest volume in Malaysia. CPC is very affordable vs SG equivalent. Strong ROI potential — prioritise for MY market entry.",
  },
  {
    id: 12, keyword: "employer of record Malaysia",
    country: "Malaysia", intent: "Transactional", monthlySearches: 590,
    competition: "Low", estimatedCpc: 4.60, suggestedCpc: 5.00,
    matchType: "Exact", opportunityScore: 85, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 24,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Deel MY", "Borderless.ai"],
    strategyNote: "Virtually uncontested in paid search. Deel and Borderless are focused on enterprise. SME and startup positioning in ad copy will capture the underserved demand segment cost-effectively — no bidding war required.",
    recommendationNote: "Underserved keyword with clear transactional intent. Low competition makes this high ROI. Ideal for EOR market penetration in MY.",
  },
  {
    id: 13, keyword: "executive search Malaysia",
    country: "Malaysia", intent: "Commercial", monthlySearches: 1000,
    competition: "Medium", estimatedCpc: 4.20, suggestedCpc: 4.60,
    matchType: "Exact", opportunityScore: 80, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 50,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Robert Walters MY", "Hays MY"],
    strategyNote: "Robert Walters and Hays maintain steady campaigns but with broad copy. Win on regional insight — specifically MY compliance, Bumiputera hiring nuances, and Labuan entity structures. Match their quality score but differentiate message.",
    recommendationNote: "Good volume-to-CPC ratio. Exact match protects budget from informational searches. Strong fit for executive placement service.",
  },
  {
    id: 14, keyword: "HR outsourcing Malaysia",
    country: "Malaysia", intent: "Commercial", monthlySearches: 720,
    competition: "Medium", estimatedCpc: 3.50, suggestedCpc: 3.80,
    matchType: "Phrase", opportunityScore: 72, action: "Test",
    competitorPressure: "Medium", competitorPressureScore: 48,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["ADP MY", "Tricor MY"],
    strategyNote: "ADP and Tricor have strong brand trust in the payroll-heavy segment. Compete by bundling EOR+payroll messaging and emphasising single-vendor simplicity. Test landing pages that separate HR advisory from payroll-only inquiries before scaling.",
    recommendationNote: "Decent intent but overlaps with payroll-only searchers. Test with phrase match and A/B landing page before committing full budget.",
  },
  {
    id: 15, keyword: "contract staffing Malaysia",
    country: "Malaysia", intent: "Transactional", monthlySearches: 480,
    competition: "Low", estimatedCpc: 2.80, suggestedCpc: 3.00,
    matchType: "Exact", opportunityScore: 77, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 32,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Persolkelly MY", "Agensi Pekerjaan EPS"],
    strategyNote: "Low competitive pressure from global players. Local agencies compete on price only — you can win on compliance expertise and placement speed. CPL expected to be portfolio's second-lowest. Capture market share now before larger players increase MY investment.",
    recommendationNote: "Low CPC with transactional signal. Niche but high-quality leads expected. Lowest CPL in MY set — strong buy.",
  },
  {
    id: 16, keyword: "talent acquisition consulting Malaysia",
    country: "Malaysia", intent: "Informational", monthlySearches: 260,
    competition: "Low", estimatedCpc: 2.20, suggestedCpc: 2.40,
    matchType: "Broad", opportunityScore: 63, action: "No",
    competitorPressure: "Low", competitorPressureScore: 15,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["LinkedIn Talent Solutions"],
    strategyNote: "LinkedIn dominates this informational intent. No meaningful paid competition present — but that's because there's no conversion value either. Budget far better allocated to higher-intent transactional keywords in the MY market.",
    recommendationNote: "Very low volume + informational intent + broad match = poor conversion outlook. Consider as a content marketing topic instead.",
  },
  {
    id: 17, keyword: "headhunter Malaysia",
    country: "Malaysia", intent: "Commercial", monthlySearches: 1900,
    competition: "High", estimatedCpc: 4.00, suggestedCpc: 4.20,
    matchType: "Broad", opportunityScore: 70, action: "Test",
    competitorPressure: "High", competitorPressureScore: 74,
    adCrowdingLevel: "High", competitiveDifficulty: "Hard",
    competitorExamples: ["Michael Page MY", "Robert Walters MY", "JAC Recruitment"],
    strategyNote: "Michael Page and Robert Walters run consistent broad campaigns on this term. Broad match amplifies auction competition dramatically. Layer RLSA on engaged visitors and add 30+ negative keywords, or switch to Phrase match 'headhunter Malaysia' variant to reduce auction waste.",
    recommendationNote: "High volume but broad match in competitive space is risky. Test with aggressive negative keywords. Pause if CTR drops below 3%.",
  },

  // ── Vietnam ────────────────────────────────────────────────────────────────
  {
    id: 18, keyword: "dịch vụ tuyển dụng nhân sự",
    country: "Vietnam", intent: "Commercial", monthlySearches: 2400,
    competition: "Low", estimatedCpc: 1.20, suggestedCpc: 1.30,
    matchType: "Phrase", opportunityScore: 83, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 22,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["VietnamWorks", "Navigos Search"],
    strategyNote: "VietnamWorks focuses on job board spend, not SEM. Your biggest 'competitor' here is low ad literacy among local HR firms. Vietnamese-language ad copy is essential for CTR — English ads in a VN-language SERP will under-perform significantly.",
    recommendationNote: "Extremely low CPC for solid commercial volume. Vietnam market is underbid — early mover advantage is significant. Highest ROI in portfolio.",
  },
  {
    id: 19, keyword: "recruitment agency Vietnam",
    country: "Vietnam", intent: "Commercial", monthlySearches: 1100,
    competition: "Low", estimatedCpc: 1.80, suggestedCpc: 2.00,
    matchType: "Exact", opportunityScore: 86, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 26,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Adecco VN", "ManpowerGroup VN"],
    strategyNote: "English-language query signals international or MNC buyer — ideal target profile. Adecco and ManpowerGroup run minimal paid campaigns in VN. Low CPC and low competition make this a must-buy for MNC client acquisition. Own the SERP now.",
    recommendationNote: "English-language query signals international or MNC buyer — ideal target profile. Low CPC and low competition make this a must-buy.",
  },
  {
    id: 20, keyword: "EOR provider Vietnam",
    country: "Vietnam", intent: "Transactional", monthlySearches: 310,
    competition: "Low", estimatedCpc: 3.40, suggestedCpc: 3.70,
    matchType: "Exact", opportunityScore: 90, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 18,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Deel VN", "Remote.com"],
    strategyNote: "Effectively uncontested — Deel VN paid campaigns are sporadic and Remote.com has limited VN presence. No local competitor runs paid search on this term. This is maximum-ROI territory: high-value niche, virtually free clicks, zero bidding war.",
    recommendationNote: "Niche transactional keyword with almost no competition. Tiny budget, exceptional CPL. Should be 'always on' for the EOR service line.",
  },
  {
    id: 21, keyword: "HR consulting Vietnam",
    country: "Vietnam", intent: "Commercial", monthlySearches: 680,
    competition: "Low", estimatedCpc: 1.60, suggestedCpc: 1.80,
    matchType: "Phrase", opportunityScore: 75, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 20,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Mercer VN", "Talentnet"],
    strategyNote: "Mercer and Talentnet focus on enterprise advisory; this mid-market term is underserved in paid search. Use it to build brand awareness in VN alongside conversion-focused EOR keywords. Very affordable cost per impression — ideal for brand lift campaigns.",
    recommendationNote: "Very affordable entry into VN HR consulting market. Supports brand building alongside transactional EOR keywords.",
  },

  // ── Thailand ───────────────────────────────────────────────────────────────
  {
    id: 22, keyword: "executive search Bangkok",
    country: "Thailand", intent: "Commercial", monthlySearches: 880,
    competition: "Medium", estimatedCpc: 3.10, suggestedCpc: 3.40,
    matchType: "Exact", opportunityScore: 81, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 44,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Robert Walters TH", "Michael Page TH"],
    strategyNote: "Robert Walters and Michael Page run limited Bangkok campaigns — impression share is available. Target Thai-listed companies and regional HQ roles specifically. Bangkok geo extension recommended to capture intent without broadening to nationwide. Moderate CPC leaves room to compete on quality.",
    recommendationNote: "Strong commercial intent with Bangkok geo-qualifier. Buyers are likely MNCs — high ACV potential. Solid CPL at this budget level.",
  },
  {
    id: 23, keyword: "recruitment agency Thailand",
    country: "Thailand", intent: "Commercial", monthlySearches: 1600,
    competition: "Medium", estimatedCpc: 2.70, suggestedCpc: 2.90,
    matchType: "Phrase", opportunityScore: 76, action: "Buy",
    competitorPressure: "Medium", competitorPressureScore: 48,
    adCrowdingLevel: "Medium", competitiveDifficulty: "Moderate",
    competitorExamples: ["Adecco TH", "Hays TH", "Persolkelly TH"],
    strategyNote: "Adecco and Hays maintain moderate TH campaigns but market is less saturated than SG. Phrase match captures city-level variants like 'recruitment agency Bangkok / Chiang Mai'. Mid-field competition means quality-score investment pays off disproportionately here.",
    recommendationNote: "Best volume-CPC balance in Thailand set. Phrase match captures city-level variants. Good brand awareness + lead gen combo.",
  },
  {
    id: 24, keyword: "employer of record Thailand",
    country: "Thailand", intent: "Transactional", monthlySearches: 420,
    competition: "Low", estimatedCpc: 4.10, suggestedCpc: 4.40,
    matchType: "Exact", opportunityScore: 89, action: "Buy",
    competitorPressure: "Low", competitorPressureScore: 28,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["Deel TH", "Horizons"],
    strategyNote: "Deel and Horizons have limited TH paid presence. First-mover advantage still available. Thai EOR market growing with nearshore manufacturing and BOI incentives driving MNC activity — capture buyers before the global EOR platforms recognise the opportunity.",
    recommendationNote: "Transactional EOR query with low competition in TH. Similar profile to VN EOR — strong ROI, small budget, high lead quality.",
  },
  {
    id: 25, keyword: "payroll outsourcing Thailand",
    country: "Thailand", intent: "Commercial", monthlySearches: 540,
    competition: "Low", estimatedCpc: 2.50, suggestedCpc: 2.70,
    matchType: "Phrase", opportunityScore: 71, action: "Test",
    competitorPressure: "Low", competitorPressureScore: 30,
    adCrowdingLevel: "Low", competitiveDifficulty: "Easy",
    competitorExamples: ["ADP TH", "Mazars Payroll"],
    strategyNote: "ADP and Mazars run occasional campaigns with low frequency and generic copy. Adjacent to core offering — payroll buyers may eventually need full EOR. Use as a retargeting anchor to capture payroll buyers and upsell broader HR outsourcing. Low downside risk.",
    recommendationNote: "Adjacent to core offering — payroll buyers may not need full EOR. Test to qualify lead quality before scaling. Low downside risk.",
  },
];
