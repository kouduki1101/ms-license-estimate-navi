const DEFAULT_PROMPT =
  "営業担当がTeamsから過去提案書、FAQ、商談メモを検索し、根拠付き回答と提案書ドラフトを作れるAIエージェントを作りたい。利用者120名、レポートも見たい。";

const SKU_DEFS = {
  "SKU-M365-E3": {
    product_name: "Microsoft 365",
    sku_name: "E3",
    service_category: "Microsoft 365",
    billing_unit: "user/month",
    fallback_price: 36,
    reason: "Teams、SharePoint、Office文書、基本IDを業務基盤として使うため、対象利用者分を見込みます。",
  },
  "SKU-M365-E5": {
    product_name: "Microsoft 365",
    sku_name: "E5",
    service_category: "Microsoft 365",
    billing_unit: "user/month",
    fallback_price: 57,
    reason: "高度なコンプライアンス、監査、セキュリティ要件が強い場合の上位候補です。",
  },
  "SKU-POWERAPPS-PREMIUM": {
    product_name: "Power Apps",
    sku_name: "Premium",
    service_category: "Power Platform",
    billing_unit: "user/month",
    fallback_price: 20,
    reason: "Dataverseやプレミアムコネクタを使う業務アプリを利用・作成するユーザーに必要です。",
  },
  "SKU-POWERAUTOMATE-PREMIUM": {
    product_name: "Power Automate",
    sku_name: "Premium",
    service_category: "Power Platform",
    billing_unit: "user/month",
    fallback_price: 15,
    reason: "承認、通知、外部連携、プレミアムコネクタを使うフロー所有者に必要です。",
  },
  "SKU-COPILOTSTUDIO-MESSAGES": {
    product_name: "Copilot Studio",
    sku_name: "Messages / capacity",
    service_category: "Power Platform",
    billing_unit: "25,000 messages/month",
    fallback_price: 200,
    reason: "会話型エージェントを提供するため、月間メッセージ量に応じた容量を見込みます。",
  },
  "SKU-POWERBI-PRO": {
    product_name: "Power BI",
    sku_name: "Pro",
    service_category: "Power Platform",
    billing_unit: "user/month",
    fallback_price: 14,
    reason: "レポート作成者と共有レポート閲覧者に必要です。",
  },
  "SKU-DATAVERSE-CAPACITY": {
    product_name: "Dataverse",
    sku_name: "Database capacity",
    service_category: "Power Platform",
    billing_unit: "GB/month",
    fallback_price: 40,
    reason: "構造化データ、承認履歴、設定値をDataverseに保持する場合の追加容量です。",
  },
  "SKU-AZURE-OPENAI-TOKENS": {
    product_name: "Azure OpenAI",
    sku_name: "gpt-4o-mini token usage",
    service_category: "Azure",
    billing_unit: "monthly token usage",
    fallback_price: null,
    reason: "検索結果や業務文書の要約、回答生成、ドラフト作成に使うトークン従量課金です。",
  },
  "SKU-AZURE-FUNCTIONS": {
    product_name: "Azure Functions",
    sku_name: "Consumption",
    service_category: "Azure",
    billing_unit: "10 executions",
    fallback_price: 0.000002,
    reason: "軽量API、外部連携、非同期ジョブをサーバーレスで実行する想定です。",
  },
  "SKU-AZURE-MONITOR": {
    product_name: "Azure Monitor",
    sku_name: "Log ingestion",
    service_category: "Azure",
    billing_unit: "GB/month",
    fallback_price: 3.34,
    reason: "利用ログ、エラー、監査ログを収集し、運用監視に使います。",
  },
  "SKU-ENTRA-ID-P1": {
    product_name: "Microsoft Entra ID",
    sku_name: "P1",
    service_category: "Security",
    billing_unit: "user/month",
    fallback_price: 6,
    reason: "SSO、条件付きアクセス、ID制御を使う場合の候補です。M365 E3で充足する前提なら追加費用は出しません。",
  },
  "SKU-DEFENDER-BUSINESS": {
    product_name: "Microsoft Defender for Business",
    sku_name: "Defender for Business",
    service_category: "Security",
    billing_unit: "user/month",
    fallback_price: 3,
    reason: "端末保護や基本的な脅威対策を提案範囲に含める場合の候補です。",
  },
};

const TEMPLATES = {
  sales: {
    typeLabel: "営業ナレッジAI",
    projectName: "営業ナレッジAIエージェント",
    keywords: ["営業", "提案", "商談", "faq", "ナレッジ", "rag", "ドラフト", "回答根拠"],
    intent: "Teamsを入口に、SharePoint上の提案書・FAQ・商談メモを検索し、Azure OpenAIで根拠付き回答と提案書ドラフトを生成する構成です。",
    selectedSkuIds: [
      "SKU-M365-E3",
      "SKU-COPILOTSTUDIO-MESSAGES",
      "SKU-AZURE-OPENAI-TOKENS",
      "SKU-POWERAUTOMATE-PREMIUM",
      "SKU-POWERBI-PRO",
      "SKU-AZURE-MONITOR",
      "SKU-ENTRA-ID-P1",
    ],
    architecture: {
      channel: "Teams",
      conversation: "Copilot Studio",
      app: "Lightweight Power Apps admin",
      data: "SharePoint knowledge base",
      ai: "Azure OpenAI + grounded prompts",
      automation: "Power Automate refresh / feedback",
      analytics: "Power BI usage dashboard",
      security: "Entra ID + Azure Monitor",
    },
    nodes: [
      ["u", "利用者", "営業担当 / Teams", "entry"],
      ["agent", "会話UI", "Copilot Studio", "orchestration"],
      ["kb", "ナレッジ", "SharePoint / FAQ / 商談メモ", "data"],
      ["ai", "生成AI", "Azure OpenAI", "ai"],
      ["flow", "更新・通知", "Power Automate", "automation"],
      ["out", "成果物", "根拠付き回答 / 提案書ドラフト", "output"],
      ["bi", "効果測定", "Power BI", "output"],
      ["ops", "認証・監視", "Entra ID / Azure Monitor", "security"],
    ],
    edges: [
      ["u", "agent", "質問"],
      ["agent", "kb", "検索"],
      ["kb", "ai", "根拠"],
      ["ai", "out", "生成"],
      ["out", "u", "返答"],
      ["flow", "kb", "更新"],
      ["agent", "bi", "利用ログ"],
      ["ops", "agent", "制御"],
    ],
    changes: [
      "データ層はDataverse中心ではなく、まずSharePointナレッジを主軸にする",
      "出力はチャット回答だけでなく、提案書ドラフトまで含める",
      "Power BIは業務KPIではなく、利用状況と改善サイクルの可視化に使う",
    ],
    assumptions: [
      "PoCではSharePoint上の文書を主要ナレッジとして扱う",
      "回答には根拠文書名と要約を含める",
      "価格は2026-06-14時点のSKUマスタを基準にする",
    ],
    nfr: [
      "ナレッジ閲覧権限はSharePoint権限とEntra IDに合わせる",
      "不適切回答を改善するため、質問・回答・フィードバックを監査可能にする",
      "本番前に検索精度、回答根拠、利用ログ保持期間を再確認する",
    ],
  },
  approval: {
    typeLabel: "稟議・承認支援",
    projectName: "稟議検索・承認支援エージェント",
    keywords: ["稟議", "承認", "申請", "ワークフロー", "決裁", "類似案件", "承認条件", "approval", "workflow", "request", "power apps", "dataverse"],
    intent: "申請画面、承認履歴、類似案件検索、承認フローを一体化し、過去案件に基づく判断材料を提示する構成です。",
    selectedSkuIds: [
      "SKU-M365-E3",
      "SKU-POWERAPPS-PREMIUM",
      "SKU-POWERAUTOMATE-PREMIUM",
      "SKU-DATAVERSE-CAPACITY",
      "SKU-COPILOTSTUDIO-MESSAGES",
      "SKU-AZURE-OPENAI-TOKENS",
      "SKU-AZURE-MONITOR",
      "SKU-ENTRA-ID-P1",
    ],
    architecture: {
      channel: "Teams / Power Apps",
      conversation: "Copilot Studio",
      app: "Power Apps approval portal",
      data: "Dataverse approval history",
      ai: "Azure OpenAI similarity summary",
      automation: "Power Automate approvals",
      analytics: "Power BI approval lead time",
      security: "Entra ID / audit log",
    },
    nodes: [
      ["requester", "申請者", "Power Apps / Teams", "entry"],
      ["app", "申請画面", "Power Apps", "orchestration"],
      ["agent", "相談UI", "Copilot Studio", "orchestration"],
      ["dv", "承認データ", "Dataverse", "data"],
      ["sp", "添付・規程", "SharePoint", "data"],
      ["ai", "類似案件分析", "Azure OpenAI", "ai"],
      ["flow", "承認フロー", "Power Automate", "automation"],
      ["approver", "承認者", "Teams通知 / 承認", "output"],
      ["audit", "監査", "Azure Monitor", "security"],
    ],
    edges: [
      ["requester", "app", "申請"],
      ["app", "dv", "保存"],
      ["agent", "dv", "類似検索"],
      ["sp", "ai", "規程"],
      ["dv", "ai", "過去案件"],
      ["ai", "app", "注意点"],
      ["app", "flow", "承認開始"],
      ["flow", "approver", "通知"],
      ["audit", "dv", "監査"],
    ],
    changes: [
      "SharePoint検索だけではなく、Dataverseで承認履歴を構造化する",
      "Power Appsを業務入口に置き、Copilotは判断材料の補助に寄せる",
      "Power Automate Premiumを承認プロセスの中核として見込む",
    ],
    assumptions: [
      "申請データと承認履歴はDataverseで管理する",
      "承認者への通知と状態更新はPower Automateで実行する",
      "AI回答は承認判断の補助であり、最終判断は承認者が行う",
    ],
    nfr: [
      "承認履歴は追跡性と改ざん防止を重視する",
      "権限は申請者、承認者、管理者で分離する",
      "PoCでは承認条件の再現率と説明可能性を検証する",
    ],
  },
  evidence: {
    typeLabel: "Evidence Pack生成",
    projectName: "Evidence Pack生成エージェント",
    keywords: ["evidence", "地政学", "レポート", "pdf", "document", "根拠", "リスク", "対応案", "文書読込", "file", "risk"],
    intent: "PDFやレポートを取り込み、要点・根拠・リスク・対応案をEvidence Packとして生成する構成です。",
    selectedSkuIds: [
      "SKU-M365-E3",
      "SKU-COPILOTSTUDIO-MESSAGES",
      "SKU-AZURE-OPENAI-TOKENS",
      "SKU-POWERAUTOMATE-PREMIUM",
      "SKU-AZURE-FUNCTIONS",
      "SKU-AZURE-MONITOR",
      "SKU-ENTRA-ID-P1",
    ],
    architecture: {
      channel: "Web / Teams",
      conversation: "Copilot Studio review flow",
      app: "Evidence review workspace",
      data: "SharePoint document library",
      ai: "Azure OpenAI extraction / synthesis",
      automation: "Power Automate + Azure Functions",
      analytics: "Evidence status board",
      security: "Entra ID / Azure Monitor",
    },
    nodes: [
      ["analyst", "分析者", "Web / Teams", "entry"],
      ["upload", "文書投入", "SharePoint library", "data"],
      ["queue", "処理キュー", "Power Automate", "automation"],
      ["fn", "抽出処理", "Azure Functions", "automation"],
      ["ai", "要約・論点化", "Azure OpenAI", "ai"],
      ["pack", "Evidence Pack", "要点 / 根拠 / リスク / 対応案", "output"],
      ["review", "レビュー", "Teams approval", "output"],
      ["ops", "監査・運用", "Azure Monitor", "security"],
    ],
    edges: [
      ["analyst", "upload", "投入"],
      ["upload", "queue", "検知"],
      ["queue", "fn", "分割/整形"],
      ["fn", "ai", "抽出テキスト"],
      ["ai", "pack", "生成"],
      ["pack", "review", "確認"],
      ["ops", "queue", "監視"],
      ["ops", "ai", "利用量"],
    ],
    changes: [
      "チャット応答よりも、文書投入から成果物生成までの処理パイプラインを中心にする",
      "Azure Functionsを入れ、PDF分割・整形・再試行などの処理を担わせる",
      "Power BIよりも、まず成果物レビュー状態と監査ログを優先する",
    ],
    assumptions: [
      "PoCでは入力文書形式をPDF/Wordに限定する",
      "Evidence Packには根拠箇所、リスク分類、対応案を必ず含める",
      "機密文書を扱うため、アクセス権とログを明確に残す",
    ],
    nfr: [
      "文書処理の失敗時に再実行できるようキュー型処理にする",
      "生成結果は人手レビューを通してから共有する",
      "根拠抜けと幻覚を評価観点に含める",
    ],
  },
  bi: {
    typeLabel: "経営BI・レポート",
    projectName: "経営KPIダッシュボード",
    keywords: ["bi", "power bi", "kpi", "dashboard", "reporting", "ダッシュボード", "可視化", "集計", "経営", "月次", "レポート"],
    intent: "複数データソースを集約し、Power BIでKPIダッシュボードと月次レポートを提供する構成です。",
    selectedSkuIds: [
      "SKU-M365-E3",
      "SKU-POWERBI-PRO",
      "SKU-POWERAUTOMATE-PREMIUM",
      "SKU-AZURE-MONITOR",
      "SKU-ENTRA-ID-P1",
    ],
    architecture: {
      channel: "Power BI / Teams",
      conversation: "Optional Q&A assistant",
      app: "Report request form",
      data: "SharePoint lists / Excel / Dataverse",
      ai: "Optional narrative summary",
      automation: "Power Automate refresh",
      analytics: "Power BI semantic model",
      security: "Entra ID row-level access",
    },
    nodes: [
      ["viewer", "閲覧者", "Power BI / Teams", "entry"],
      ["sources", "データソース", "Excel / SharePoint / Dataverse", "data"],
      ["refresh", "更新制御", "Power Automate", "automation"],
      ["model", "意味モデル", "Power BI semantic model", "orchestration"],
      ["report", "ダッシュボード", "Power BI", "output"],
      ["summary", "月次要約", "Azure OpenAI optional", "ai"],
      ["sec", "権限", "Entra ID / RLS", "security"],
    ],
    edges: [
      ["sources", "refresh", "更新"],
      ["refresh", "model", "取込"],
      ["model", "report", "可視化"],
      ["model", "summary", "要約"],
      ["summary", "report", "説明文"],
      ["viewer", "report", "閲覧"],
      ["sec", "report", "制御"],
    ],
    changes: [
      "Copilot Studioを主役にせず、Power BIモデルと更新処理を中心にする",
      "ライセンスはPower BI Pro閲覧者数の影響が大きい",
      "Azure OpenAIは必須ではなく、月次コメント生成の拡張扱いにする",
    ],
    assumptions: [
      "PoCでは対象KPIとデータソースを限定する",
      "共有閲覧者はPower BI Pro保有を前提に控除する",
      "データ更新頻度は日次または月次を想定する",
    ],
    nfr: [
      "行レベルセキュリティと部門別閲覧権限を確認する",
      "データ品質チェックと更新失敗通知を組み込む",
      "経営指標の定義ブレを管理する",
    ],
  },
};

const state = {
  data: null,
  scenario: null,
  filter: "all",
  staticMode: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function usd(value) {
  return Number.isFinite(value)
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "-";
}

function jpy(value) {
  return Number.isFinite(value) ? `¥${Math.round(value).toLocaleString("ja-JP")}` : "-";
}

function bytes(value) {
  if (!Number.isFinite(value)) return "";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024)).toLocaleString("ja-JP")} KB`;
}

function modifiedLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function catalogMap() {
  const map = new Map();
  for (const [skuId, def] of Object.entries(SKU_DEFS)) {
    map.set(skuId, { sku_id: skuId, ...def, unit_price_usd: def.fallback_price });
  }
  for (const item of state.data?.skuCatalog ?? []) {
    const def = SKU_DEFS[item.sku_id] ?? {};
    map.set(item.sku_id, {
      sku_id: item.sku_id,
      ...def,
      ...item,
      unit_price_usd: Number.isFinite(item.unit_price_usd) ? item.unit_price_usd : def.fallback_price,
    });
  }
  return map;
}

function existingQuantity(licenses, product, sku) {
  const productNeedle = normalize(product);
  const skuNeedle = normalize(sku);
  return (licenses ?? []).reduce((sum, license) => {
    const productName = normalize(license.product_name);
    const skuName = normalize(license.sku_name ?? license.license_name);
    const licenseName = normalize(license.license_name);
    const productMatches = productName.includes(productNeedle) || productNeedle.includes(productName);
    const skuMatches = skuName.includes(skuNeedle) || licenseName.includes(skuNeedle);
    return productMatches && skuMatches ? sum + number(license.quantity) : sum;
  }, 0);
}

function cloneTemplate(template) {
  return {
    ...template,
    selectedSkuIds: [...template.selectedSkuIds],
    nodes: template.nodes.map(([id, label, detail, lane]) => ({ id, label, detail, lane })),
    edges: template.edges.map(([from, to, label]) => ({ from, to, label })),
    changes: [...template.changes],
    assumptions: [...template.assumptions],
    nfr: [...template.nfr],
    architecture: { ...template.architecture },
  };
}

function scoreTemplate(prompt, template) {
  const text = normalize(prompt);
  return template.keywords.reduce((score, keyword) => score + (text.includes(normalize(keyword)) ? 1 : 0), 0);
}

function hasAny(prompt, words) {
  const text = normalize(prompt);
  return words.some((word) => text.includes(normalize(word)));
}

function addNode(scenario, id, label, detail, lane) {
  if (!scenario.nodes.some((node) => node.id === id)) scenario.nodes.push({ id, label, detail, lane });
}

function addEdge(scenario, from, to, label) {
  if (!scenario.edges.some((edge) => edge.from === from && edge.to === to)) scenario.edges.push({ from, to, label });
}

function applyOverlays(scenario, prompt) {
  if (hasAny(prompt, ["外部連携", "api", "バッチ", "ジョブ", "夜間", "基幹"])) {
    scenario.selectedSkuIds.push("SKU-AZURE-FUNCTIONS", "SKU-POWERAUTOMATE-PREMIUM");
    addNode(scenario, "api", "外部連携", "Azure Functions / API", "automation");
    addEdge(scenario, "api", scenario.nodes.find((node) => node.lane === "data")?.id ?? "kb", "同期");
    scenario.changes.push("外部連携・バッチ要件を検知したため、Azure Functionsを追加候補にする");
  }

  if (hasAny(prompt, ["レポート", "bi", "dashboard", "ダッシュボード", "kpi", "可視化"]) && !scenario.selectedSkuIds.includes("SKU-POWERBI-PRO")) {
    scenario.selectedSkuIds.push("SKU-POWERBI-PRO");
    addNode(scenario, "bi", "可視化", "Power BI", "output");
    addEdge(scenario, scenario.nodes.find((node) => node.lane === "data")?.id ?? "dv", "bi", "集計");
    scenario.changes.push("レポート要件を検知したため、Power BI Proを追加候補にする");
  }

  if (hasAny(prompt, ["セキュリティ", "監査", "ログ", "端末", "defender", "脅威", "機密"])) {
    scenario.selectedSkuIds.push("SKU-DEFENDER-BUSINESS", "SKU-AZURE-MONITOR");
    addNode(scenario, "defender", "端末保護", "Defender for Business", "security");
    addEdge(scenario, "defender", scenario.nodes.find((node) => node.lane === "entry")?.id ?? "u", "保護");
    scenario.changes.push("セキュリティ要件を検知したため、Defenderと監査ログを強める");
  }

  scenario.selectedSkuIds = unique(scenario.selectedSkuIds);
  scenario.nodes = scenario.nodes.filter((node, index, all) => all.findIndex((item) => item.id === node.id) === index);
  scenario.edges = scenario.edges.filter((edge) => scenario.nodes.some((node) => node.id === edge.from) && scenario.nodes.some((node) => node.id === edge.to));
}

function inferScenario(prompt) {
  const entries = Object.entries(TEMPLATES)
    .map(([key, template]) => ({ key, score: scoreTemplate(prompt, template) }))
    .sort((a, b) => b.score - a.score);
  const winner = entries[0].score > 0 ? entries[0].key : "sales";
  const scenario = cloneTemplate(TEMPLATES[winner]);
  scenario.prompt = prompt;
  scenario.businessPurpose = prompt;
  scenario.fitScore = Math.min(95, 62 + entries[0].score * 8);
  applyOverlays(scenario, prompt);
  return scenario;
}

function defaultScenario(data) {
  const req = data?.requirements ?? {};
  const usage = req.monthly_usage_assumptions ?? {};
  const azure = usage.azure_openai ?? {};
  const licenses = data?.existingLicenses ?? [];
  const base = inferScenario(req.business_purpose || DEFAULT_PROMPT);
  return {
    ...base,
    projectName: req.business_purpose ? base.projectName : "営業部向けAI業務支援PoC",
    userCount: number(req.user_count, 120),
    makerCount: number(req.maker_count, 15),
    adminCount: number(req.admin_count, 5),
    viewerCount: Math.max(existingQuantity(licenses, "Power BI", "Pro"), number(req.power_bi_viewer_count, 30), 30),
    inputTokens: number(azure.input_tokens ?? usage.azure_openai_input_tokens, 20000000),
    outputTokens: number(azure.output_tokens ?? usage.azure_openai_output_tokens, 5000000),
    copilotMessages: number(usage.copilot_studio_messages, 50000),
    logIngestionGb: number(usage.log_ingestion_gb, 1),
    dataverseGb: number(usage.dataverse_storage_gb, 20),
    functionExecutions: number(usage.function_executions, 30000),
    fxRate: number(data?.estimate?.fx_rate_usd_jpy, 155.2),
    existing: {
      m365e3: existingQuantity(licenses, "Microsoft 365", "E3") || 120,
      powerApps: existingQuantity(licenses, "Power Apps", "Premium"),
      powerAutomate: existingQuantity(licenses, "Power Automate", "Premium"),
      powerBi: existingQuantity(licenses, "Power BI", "Pro") || 30,
      copilotCapacity: 0,
    },
  };
}

function syncScenarioToControls() {
  const s = state.scenario;
  $("#projectName").value = s.projectName;
  $("#businessPurpose").value = s.businessPurpose;
  $("#userCount").value = s.userCount;
  $("#makerCount").value = s.makerCount;
  $("#adminCount").value = s.adminCount;
  $("#viewerCount").value = s.viewerCount;
  $("#inputTokens").value = s.inputTokens;
  $("#outputTokens").value = s.outputTokens;
  $("#copilotMessages").value = s.copilotMessages;
  $("#logIngestionGb").value = s.logIngestionGb;
  $("#dataverseGb").value = s.dataverseGb;
  $("#fxRate").value = s.fxRate;
  $("#existingM365E3").value = s.existing.m365e3;
  $("#existingPowerApps").value = s.existing.powerApps;
  $("#existingPowerAutomate").value = s.existing.powerAutomate;
  $("#existingPowerBi").value = s.existing.powerBi;
}

function readControls() {
  const s = state.scenario;
  s.projectName = $("#projectName").value.trim() || s.projectName;
  s.businessPurpose = $("#businessPurpose").value.trim() || s.businessPurpose;
  s.userCount = number($("#userCount").value);
  s.makerCount = number($("#makerCount").value);
  s.adminCount = number($("#adminCount").value);
  s.viewerCount = number($("#viewerCount").value);
  s.inputTokens = number($("#inputTokens").value);
  s.outputTokens = number($("#outputTokens").value);
  s.copilotMessages = number($("#copilotMessages").value);
  s.logIngestionGb = number($("#logIngestionGb").value);
  s.dataverseGb = number($("#dataverseGb").value);
  s.fxRate = number($("#fxRate").value, 155.2);
  s.existing.m365e3 = number($("#existingM365E3").value);
  s.existing.powerApps = number($("#existingPowerApps").value);
  s.existing.powerAutomate = number($("#existingPowerAutomate").value);
  s.existing.powerBi = number($("#existingPowerBi").value);
}

function unitPrice(skuId) {
  const catalog = catalogMap().get(skuId);
  const fallback = SKU_DEFS[skuId]?.fallback_price;
  return Number.isFinite(catalog?.unit_price_usd) ? catalog.unit_price_usd : fallback;
}

function skuMeta(skuId) {
  return catalogMap().get(skuId) ?? { sku_id: skuId, ...(SKU_DEFS[skuId] ?? {}) };
}

function lineFor(skuId, requiredQuantity, existingQuantity, unitPriceUsd, reason, options = {}) {
  const meta = skuMeta(skuId);
  const additionalQuantity = options.forceUsage ? requiredQuantity : Math.max(requiredQuantity - existingQuantity, 0);
  const monthlyUsd = Number.isFinite(options.monthlyUsd)
    ? options.monthlyUsd
    : Number.isFinite(unitPriceUsd)
      ? additionalQuantity * unitPriceUsd
      : null;
  return {
    sku_id: skuId,
    product_name: meta.product_name,
    sku_name: meta.sku_name,
    service_category: meta.service_category,
    billing_unit: options.billingUnit ?? meta.billing_unit,
    required_quantity: requiredQuantity,
    existing_quantity: existingQuantity,
    additional_quantity: monthlyUsd === 0 ? 0 : additionalQuantity,
    unit_price_usd: unitPriceUsd,
    monthly_usd: monthlyUsd,
    annual_usd: Number.isFinite(monthlyUsd) ? monthlyUsd * 12 : null,
    reason,
    status: options.status ?? (additionalQuantity <= 0 || monthlyUsd === 0 ? "既存で充足" : "追加見込み"),
    statusKind: options.statusKind ?? (additionalQuantity <= 0 || monthlyUsd === 0 ? "covered" : "add"),
  };
}

function buildEstimateLines() {
  const s = state.scenario;
  const ids = new Set(s.selectedSkuIds);
  const lines = [];

  if (ids.has("SKU-M365-E3")) lines.push(lineFor("SKU-M365-E3", s.userCount, s.existing.m365e3, unitPrice("SKU-M365-E3"), SKU_DEFS["SKU-M365-E3"].reason));
  if (ids.has("SKU-POWERAPPS-PREMIUM")) lines.push(lineFor("SKU-POWERAPPS-PREMIUM", s.userCount, s.existing.powerApps, unitPrice("SKU-POWERAPPS-PREMIUM"), SKU_DEFS["SKU-POWERAPPS-PREMIUM"].reason));
  if (ids.has("SKU-POWERAUTOMATE-PREMIUM")) {
    const flowUsers = Math.max(s.makerCount, s.adminCount, 1);
    lines.push(lineFor("SKU-POWERAUTOMATE-PREMIUM", flowUsers, s.existing.powerAutomate, unitPrice("SKU-POWERAUTOMATE-PREMIUM"), SKU_DEFS["SKU-POWERAUTOMATE-PREMIUM"].reason));
  }
  if (ids.has("SKU-COPILOTSTUDIO-MESSAGES")) {
    const packs = Math.max(Math.ceil(s.copilotMessages / 25000), 1);
    lines.push(lineFor("SKU-COPILOTSTUDIO-MESSAGES", packs, s.existing.copilotCapacity, unitPrice("SKU-COPILOTSTUDIO-MESSAGES"), SKU_DEFS["SKU-COPILOTSTUDIO-MESSAGES"].reason, { billingUnit: "25,000 messages/month" }));
  }
  if (ids.has("SKU-POWERBI-PRO")) {
    const biUsers = Math.max(s.viewerCount, s.makerCount, 1);
    lines.push(lineFor("SKU-POWERBI-PRO", biUsers, s.existing.powerBi, unitPrice("SKU-POWERBI-PRO"), SKU_DEFS["SKU-POWERBI-PRO"].reason));
  }
  if (ids.has("SKU-DATAVERSE-CAPACITY") && s.dataverseGb > 0) lines.push(lineFor("SKU-DATAVERSE-CAPACITY", s.dataverseGb, 0, unitPrice("SKU-DATAVERSE-CAPACITY"), SKU_DEFS["SKU-DATAVERSE-CAPACITY"].reason));
  if (ids.has("SKU-AZURE-OPENAI-TOKENS")) {
    const monthly = (s.inputTokens / 1000) * 0.00015 + (s.outputTokens / 1000) * 0.0006;
    lines.push(lineFor("SKU-AZURE-OPENAI-TOKENS", 1, 0, monthly, SKU_DEFS["SKU-AZURE-OPENAI-TOKENS"].reason, { forceUsage: true, monthlyUsd: monthly, billingUnit: "monthly token usage", status: "従量課金", statusKind: "usage" }));
  }
  if (ids.has("SKU-AZURE-FUNCTIONS")) {
    const units = Math.max(Math.ceil(s.functionExecutions / 10), 1);
    lines.push(lineFor("SKU-AZURE-FUNCTIONS", units, 0, unitPrice("SKU-AZURE-FUNCTIONS"), SKU_DEFS["SKU-AZURE-FUNCTIONS"].reason, { forceUsage: true, status: "従量課金", statusKind: "usage" }));
  }
  if (ids.has("SKU-AZURE-MONITOR") && s.logIngestionGb > 0) lines.push(lineFor("SKU-AZURE-MONITOR", s.logIngestionGb, 0, unitPrice("SKU-AZURE-MONITOR"), SKU_DEFS["SKU-AZURE-MONITOR"].reason, { forceUsage: true, status: "従量課金", statusKind: "usage" }));
  if (ids.has("SKU-ENTRA-ID-P1")) {
    const covered = Math.max(s.existing.m365e3, ids.has("SKU-M365-E3") ? s.userCount : 0);
    lines.push(lineFor("SKU-ENTRA-ID-P1", s.userCount, covered, unitPrice("SKU-ENTRA-ID-P1"), SKU_DEFS["SKU-ENTRA-ID-P1"].reason, { monthlyUsd: 0, status: "M365 E3に含む前提", statusKind: "covered" }));
  }
  if (ids.has("SKU-DEFENDER-BUSINESS")) lines.push(lineFor("SKU-DEFENDER-BUSINESS", s.userCount, 0, unitPrice("SKU-DEFENDER-BUSINESS"), SKU_DEFS["SKU-DEFENDER-BUSINESS"].reason));

  return lines;
}

function renderMetrics(lines) {
  const monthlyUsd = lines.reduce((sum, line) => sum + (Number.isFinite(line.monthly_usd) ? line.monthly_usd : 0), 0);
  $("#monthlyUsd").textContent = usd(monthlyUsd);
  $("#monthlyJpy").textContent = jpy(monthlyUsd * state.scenario.fxRate);
  $("#annualUsd").textContent = usd(monthlyUsd * 12);
  $("#additionalSkuCount").textContent = String(lines.filter((line) => line.additional_quantity > 0 && line.monthly_usd > 0).length);
  $("#scenarioType").textContent = state.scenario.typeLabel;
  $("#pricingAsOf").textContent = state.data?.estimate?.pricing_as_of_label ?? "2026-06-14";
}

function renderArchitecture() {
  const columns = [
    { id: "front", label: "入口・体験", lanes: ["entry", "orchestration"] },
    { id: "knowledge", label: "データ・AI", lanes: ["data", "ai"] },
    { id: "process", label: "自動化・連携", lanes: ["automation"] },
    { id: "outcome", label: "成果物・統制", lanes: ["output", "security"] },
  ];
  const color = {
    entry: "#e8f5f1",
    orchestration: "#eaf1ff",
    data: "#f5f0ff",
    ai: "#fff4df",
    automation: "#edf7fb",
    output: "#f0f7e8",
    security: "#fdecef",
  };
  const width = 980;
  const columnWidth = width / columns.length;
  const columnForLane = Object.fromEntries(columns.flatMap((column, index) => column.lanes.map((lane) => [lane, index])));
  const byColumn = columns.map((column) => state.scenario.nodes.filter((node) => column.lanes.includes(node.lane)));
  const positions = new Map();
  let maxY = 0;
  byColumn.forEach((nodes, columnIndex) => {
    nodes.forEach((node, index) => {
      const x = columnIndex * columnWidth + 24;
      const y = 74 + index * 102;
      positions.set(node.id, { x, y, w: columnWidth - 48, h: 76 });
      maxY = Math.max(maxY, y + 96);
    });
  });
  const height = Math.max(420, maxY + 34);
  const lineForEdge = (edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return "";
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const mid = (x1 + x2) / 2;
    const fromColumn = columnForLane[state.scenario.nodes.find((node) => node.id === edge.from)?.lane] ?? 0;
    const toColumn = columnForLane[state.scenario.nodes.find((node) => node.id === edge.to)?.lane] ?? 0;
    const path = fromColumn <= toColumn
      ? `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`
      : `M ${from.x} ${y1} C ${from.x - 48} ${y1}, ${to.x + to.w + 48} ${y2}, ${to.x + to.w} ${y2}`;
    return `<path d="${path}" stroke="#5d6f82" stroke-width="2" fill="none" marker-end="url(#arrow)" opacity="0.72"><title>${escapeHtml(edge.label)}</title></path>`;
  };
  const laneHeaders = columns.map((column, index) => {
    const x = index * columnWidth + 24;
    return `<text x="${x}" y="36" fill="#667484" font-size="15" font-weight="700">${escapeHtml(column.label)}</text>`;
  }).join("");
  const nodes = state.scenario.nodes.map((node) => {
    const p = positions.get(node.id);
    return `
      <g>
        <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="10" fill="${color[node.lane]}" stroke="#b9c6d2" />
        <text x="${p.x + 14}" y="${p.y + 27}" fill="#17202a" font-size="17" font-weight="800">${escapeHtml(node.label)}</text>
        <text x="${p.x + 14}" y="${p.y + 54}" fill="#536273" font-size="13">${escapeHtml(node.detail)}</text>
      </g>`;
  }).join("");
  $("#architectureCanvas").innerHTML = `
    <svg class="architecture-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="入力内容から生成したMicrosoftアーキテクチャ図">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5d6f82"></path>
        </marker>
      </defs>
      <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#f8fafc" />
      ${laneHeaders}
      ${state.scenario.edges.map(lineForEdge).join("")}
      ${nodes}
    </svg>`;
  $("#architectureTitle").textContent = `${state.scenario.typeLabel} の構成案`;
  $("#architectureSubtitle").textContent = `${state.scenario.nodes.length} nodes / ${state.scenario.edges.length} flows`;
  $("#fitBadge").textContent = `${state.scenario.fitScore ?? 72}% fit`;
  $("#proposalIntent").textContent = state.scenario.intent;
  renderList("#changeList", state.scenario.changes);
  renderList("#assumptionList", state.scenario.assumptions);
  renderList("#nfrList", state.scenario.nfr);
}

function renderList(selector, items) {
  const list = $(selector);
  list.innerHTML = "";
  items.slice(0, 5).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function renderLines(lines) {
  const tbody = $("#lineRows");
  tbody.innerHTML = "";
  for (const line of lines) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <span class="sku-name">${escapeHtml(line.product_name)} / ${escapeHtml(line.sku_name)}</span>
        <span class="sku-meta">${escapeHtml(line.service_category)} · ${escapeHtml(line.billing_unit)} · <span class="status-text ${escapeHtml(line.statusKind)}">${escapeHtml(line.status)}</span></span>
      </td>
      <td>${escapeHtml(line.reason)}</td>
      <td class="number">${Number(line.required_quantity).toLocaleString("ja-JP")}</td>
      <td class="number">${Number(line.existing_quantity).toLocaleString("ja-JP")}</td>
      <td class="number">${Number(line.additional_quantity).toLocaleString("ja-JP")}</td>
      <td class="number">${usd(line.unit_price_usd)}</td>
      <td class="number">${usd(line.monthly_usd)}</td>`;
    tbody.appendChild(tr);
  }
}

function renderServiceTags(lines) {
  const target = $("#serviceTags");
  target.innerHTML = "";
  unique(lines.map((line) => line.service_category)).forEach((category) => {
    const span = document.createElement("span");
    span.textContent = category;
    target.appendChild(span);
  });
}

function rerenderWorkbench() {
  readControls();
  const lines = buildEstimateLines();
  renderMetrics(lines);
  renderArchitecture();
  renderLines(lines);
  renderServiceTags(lines);
  $("#estimateNote").textContent = `USD公式価格スナップショットを優先。JPYは ${state.scenario.fxRate.toLocaleString("ja-JP")} 円/USDで換算。税・割引は含みません。`;
}

function addMessage(role, body, bullets = []) {
  const row = document.createElement("div");
  row.className = `message ${role}`;
  row.innerHTML = `<strong>${role === "user" ? "相談" : "AI"}</strong><div>${escapeHtml(body)}</div>`;
  if (bullets.length) {
    const ul = document.createElement("ul");
    bullets.forEach((bullet) => {
      const li = document.createElement("li");
      li.textContent = bullet;
      ul.appendChild(li);
    });
    row.appendChild(ul);
  }
  $("#chatLog").appendChild(row);
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
}

function renderChatInitial() {
  $("#chatLog").innerHTML = "";
  addMessage("ai", "相談文から設計タイプを判定し、ノード、接続、ライセンス、コストを組み替えます。テンプレ選択後に文章を足すと構成も変わります。");
}

function applyPrompt(prompt) {
  const inferred = inferScenario(prompt);
  state.scenario = {
    ...state.scenario,
    ...inferred,
    existing: state.scenario.existing,
    userCount: state.scenario.userCount,
    makerCount: state.scenario.makerCount,
    adminCount: state.scenario.adminCount,
    viewerCount: state.scenario.viewerCount,
    inputTokens: state.scenario.inputTokens,
    outputTokens: state.scenario.outputTokens,
    copilotMessages: state.scenario.copilotMessages,
    logIngestionGb: state.scenario.logIngestionGb,
    dataverseGb: state.scenario.dataverseGb,
    functionExecutions: state.scenario.functionExecutions,
    fxRate: state.scenario.fxRate,
  };
  syncScenarioToControls();
  rerenderWorkbench();
  addMessage("ai", `${state.scenario.typeLabel} として構成しました。固定テンプレではなく、検知した要件に応じてノードとSKUを変更しています。`, state.scenario.changes.slice(0, 3));
}

function selectedCapabilities() {
  const ids = new Set(state.scenario.selectedSkuIds);
  const capabilities = [];
  if (ids.has("SKU-M365-E3")) capabilities.push("Microsoft 365 collaboration", "SharePoint knowledge base", "Teams");
  if (ids.has("SKU-POWERAPPS-PREMIUM")) capabilities.push("Power Apps business app");
  if (ids.has("SKU-POWERAUTOMATE-PREMIUM")) capabilities.push("Power Automate workflow");
  if (ids.has("SKU-COPILOTSTUDIO-MESSAGES")) capabilities.push("Copilot Studio agent");
  if (ids.has("SKU-AZURE-OPENAI-TOKENS")) capabilities.push("Azure OpenAI generation");
  if (ids.has("SKU-POWERBI-PRO")) capabilities.push("Power BI reporting");
  if (ids.has("SKU-DATAVERSE-CAPACITY")) capabilities.push("Dataverse data storage");
  if (ids.has("SKU-AZURE-FUNCTIONS")) capabilities.push("Azure Functions integration");
  if (ids.has("SKU-AZURE-MONITOR")) capabilities.push("Audit and monitoring");
  if (ids.has("SKU-DEFENDER-BUSINESS")) capabilities.push("Endpoint security");
  return unique(capabilities);
}

function existingLicensesPayload() {
  const s = state.scenario;
  return [
    ["EL-001", "Microsoft 365 E3", "Microsoft 365", "E3", s.existing.m365e3, "PoC対象ユーザー", "SharePoint Online;Teams;Office apps;Entra ID P1"],
    ["EL-002", "Power BI Pro", "Power BI", "Pro", s.existing.powerBi, "レポート作成者・閲覧者", "Power BI"],
    ["EL-003", "Power Apps Premium", "Power Apps", "Premium", s.existing.powerApps, "アプリ利用者・作成者", "Power Apps;Dataverse"],
    ["EL-004", "Power Automate Premium", "Power Automate", "Premium", s.existing.powerAutomate, "フロー所有者", "Power Automate"],
  ]
    .filter((row) => number(row[4]) > 0)
    .map(([existing_license_id, license_name, product_name, sku_name, quantity, assigned_scope, applicable_services]) => ({
      existing_license_id,
      license_name,
      product_name,
      sku_name,
      quantity,
      assigned_scope,
      applicable_services: applicable_services.split(";"),
      notes: "ダッシュボード入力値",
    }));
}

function inputPayload() {
  readControls();
  return {
    project_name: state.scenario.projectName,
    business_purpose: state.scenario.businessPurpose,
    user_count: state.scenario.userCount,
    maker_count: state.scenario.makerCount,
    admin_count: state.scenario.adminCount,
    power_bi_viewer_count: state.scenario.viewerCount,
    azure_openai_input_tokens: state.scenario.inputTokens,
    azure_openai_output_tokens: state.scenario.outputTokens,
    copilot_studio_messages: state.scenario.copilotMessages,
    log_ingestion_gb: state.scenario.logIngestionGb,
    dataverse_storage_gb: state.scenario.dataverseGb,
    fx_rate_usd_jpy: state.scenario.fxRate,
    required_capabilities: selectedCapabilities(),
    existing_licenses: existingLicensesPayload(),
    architecture: state.scenario.architecture,
    architecture_nodes: state.scenario.nodes,
    architecture_edges: state.scenario.edges,
    proposal_intent: state.scenario.intent,
    assumptions: state.scenario.assumptions,
    nfr: state.scenario.nfr,
  };
}

async function saveInput() {
  setJobBadge({ status: "running" });
  $("#jobLog").textContent = "条件を保存中...";
  if (state.staticMode) {
    localStorage.setItem("ms-license-navi-input", JSON.stringify(inputPayload()));
    setJobBadge({ status: "ok" });
    $("#jobLog").textContent = "ブラウザ内に保存しました。GitHub Pages版ではサーバー保存は行いません。";
    return;
  }
  try {
    const response = await fetch("/api/input", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inputPayload()),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error ?? "保存に失敗しました");
    state.data = payload;
    setJobBadge(payload.job);
    $("#jobLog").textContent = "保存しました。この条件で提案パックを生成できます。";
    renderDownloads(payload.outputs ?? []);
  } catch {
    state.staticMode = true;
    localStorage.setItem("ms-license-navi-input", JSON.stringify(inputPayload()));
    setJobBadge({ status: "ok" });
    $("#jobLog").textContent = "ブラウザ内に保存しました。GitHub Pages版ではサーバー保存は行いません。";
  }
}

function selectedFormats() {
  return $$('input[name="format"]:checked').map((input) => input.value);
}

function proposalMarkdown() {
  const lines = buildEstimateLines();
  const monthlyUsd = lines.reduce((sum, line) => sum + (Number.isFinite(line.monthly_usd) ? line.monthly_usd : 0), 0);
  const s = state.scenario;
  return [
    `# ${s.projectName}`,
    "",
    `設計タイプ: ${s.typeLabel}`,
    "",
    "## ユースケース",
    s.businessPurpose,
    "",
    "## 提案方針",
    s.intent,
    "",
    "## アーキテクチャ",
    ...s.nodes.map((node) => `- ${node.label}: ${node.detail}`),
    "",
    "## 主な接続",
    ...s.edges.map((edge) => `- ${edge.from} -> ${edge.to}: ${edge.label}`),
    "",
    "## 概算コスト",
    `- 月額USD: ${usd(monthlyUsd)}`,
    `- 月額JPY: ${jpy(monthlyUsd * s.fxRate)}`,
    `- 年額USD: ${usd(monthlyUsd * 12)}`,
    "",
    "## ライセンス・Azure明細",
    "| サービス / SKU | 必要数 | 既存 | 追加 | 月額USD | 理由 |",
    "|---|---:|---:|---:|---:|---|",
    ...lines.map((line) => `| ${line.product_name} / ${line.sku_name} | ${line.required_quantity} | ${line.existing_quantity} | ${line.additional_quantity} | ${usd(line.monthly_usd)} | ${line.reason} |`),
    "",
    "## 設計が変わった点",
    ...s.changes.map((item) => `- ${item}`),
    "",
    "## 前提",
    ...s.assumptions.map((item) => `- ${item}`),
    "",
    "## 非機能観点",
    ...s.nfr.map((item) => `- ${item}`),
    "",
    `> ${state.data?.estimate?.pricing_as_of_label ?? "2026-06-14"} 時点のSKUマスタに基づく提案前概算です。税、割引、契約条件は含みません。`,
  ].join("\n");
}

function downloadText(filename, body, type) {
  const blob = new Blob([body], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function generate() {
  const button = $("#generateBtn");
  button.disabled = true;
  try {
    await saveInput();
    if (state.staticMode) {
      const formats = selectedFormats();
      const slug = state.scenario.projectName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-") || "ms-license-estimate";
      if (formats.includes("markdown")) downloadText(`${slug}.md`, proposalMarkdown(), "text/markdown;charset=utf-8");
      if (formats.includes("azureMeter") || formats.includes("audit")) downloadText(`${slug}.json`, JSON.stringify(inputPayload(), null, 2), "application/json;charset=utf-8");
      setJobBadge({ status: "ok" });
      $("#jobLog").textContent = "Pages版としてMarkdown/JSONを生成しました。Excel/PPTXは同梱済み成果物からダウンロードしてください。";
      return;
    }
    setJobBadge({ status: "running" });
    $("#jobLog").textContent = "提案パックを生成中...";
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ formats: selectedFormats() }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.job?.error ?? payload?.error ?? "生成に失敗しました");
    state.data = payload.state;
    renderJob(payload.state.job);
    renderDownloads(payload.state.outputs ?? []);
  } finally {
    button.disabled = false;
  }
}

function setJobBadge(job) {
  const status = job?.status ?? "idle";
  $("#jobBadge").textContent = status;
  $("#jobBadge").className = `status-pill ${status}`;
}

function renderJob(job) {
  setJobBadge(job);
  if (!job || job.status === "idle" || job.status === "static") {
    $("#jobLog").textContent = "生成待機中";
    return;
  }
  const lines = [
    `status: ${job.status}`,
    job.startedAt ? `started: ${job.startedAt}` : "",
    job.finishedAt ? `finished: ${job.finishedAt}` : "",
    job.error ? `error: ${job.error}` : "",
    "",
    ...(job.steps ?? []).map((step) => [`[${step.status}] ${step.label}`, step.stdout, step.stderr].filter(Boolean).join("\n")),
  ].filter(Boolean);
  $("#jobLog").textContent = lines.join("\n\n");
}

function kindVisible(file) {
  if (file.kind === "Preview" || /\.png$/i.test(file.name)) return false;
  if (state.filter === "all") return true;
  if (state.filter === "Markdown") return file.kind === "Markdown" || String(file.kind).includes("MD");
  return file.kind === state.filter;
}

function renderDownloads(outputs) {
  const target = $("#downloads");
  const visible = (outputs ?? []).filter(kindVisible);
  target.innerHTML = "";
  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "該当する成果物はまだありません。";
    target.appendChild(empty);
    return;
  }
  for (const file of visible.slice(0, 20)) {
    const row = document.createElement("div");
    row.className = "download-row";
    row.innerHTML = `
      <div>
        <strong title="${escapeHtml(file.relative)}">${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.kind)} · ${bytes(file.bytes)} · ${modifiedLabel(file.modifiedAt)}</span>
      </div>
      <a class="download-link" href="${file.downloadUrl}">Download</a>`;
    target.appendChild(row);
  }
}

async function loadState() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) throw new Error(await response.text());
    state.data = await response.json();
    state.staticMode = false;
  } catch {
    const response = await fetch("data/state.json");
    if (!response.ok) throw new Error(await response.text());
    state.data = await response.json();
    state.staticMode = true;
  }
  state.scenario = defaultScenario(state.data);
  const saved = localStorage.getItem("ms-license-navi-input");
  if (saved) {
    try {
      const savedInput = JSON.parse(saved);
      state.scenario = {
        ...state.scenario,
        projectName: savedInput.project_name ?? state.scenario.projectName,
        businessPurpose: savedInput.business_purpose ?? state.scenario.businessPurpose,
        userCount: number(savedInput.user_count, state.scenario.userCount),
        makerCount: number(savedInput.maker_count, state.scenario.makerCount),
        adminCount: number(savedInput.admin_count, state.scenario.adminCount),
        viewerCount: number(savedInput.power_bi_viewer_count, state.scenario.viewerCount),
        inputTokens: number(savedInput.azure_openai_input_tokens, state.scenario.inputTokens),
        outputTokens: number(savedInput.azure_openai_output_tokens, state.scenario.outputTokens),
        copilotMessages: number(savedInput.copilot_studio_messages, state.scenario.copilotMessages),
        logIngestionGb: number(savedInput.log_ingestion_gb, state.scenario.logIngestionGb),
        dataverseGb: number(savedInput.dataverse_storage_gb, state.scenario.dataverseGb),
        fxRate: number(savedInput.fx_rate_usd_jpy, state.scenario.fxRate),
      };
    } catch {
      localStorage.removeItem("ms-license-navi-input");
    }
  }
  const promptParam = new URLSearchParams(window.location.search).get("prompt");
  if (promptParam) {
    const inferred = inferScenario(promptParam);
    state.scenario = {
      ...state.scenario,
      ...inferred,
      existing: state.scenario.existing,
      userCount: state.scenario.userCount,
      makerCount: state.scenario.makerCount,
      adminCount: state.scenario.adminCount,
      viewerCount: state.scenario.viewerCount,
      inputTokens: state.scenario.inputTokens,
      outputTokens: state.scenario.outputTokens,
      copilotMessages: state.scenario.copilotMessages,
      logIngestionGb: state.scenario.logIngestionGb,
      dataverseGb: state.scenario.dataverseGb,
      functionExecutions: state.scenario.functionExecutions,
      fxRate: state.scenario.fxRate,
    };
  }
  $("#promptInput").value = state.scenario.businessPurpose || DEFAULT_PROMPT;
  syncScenarioToControls();
  renderChatInitial();
  rerenderWorkbench();
  renderJob(state.data.job);
  renderDownloads(state.data.outputs ?? []);
}

function bindEvents() {
  $("#refreshBtn").addEventListener("click", () => loadState().catch(showError));
  $("#saveBtn").addEventListener("click", () => saveInput().catch(showError));
  $("#generateBtn").addEventListener("click", () => generate().catch(showError));
  $("#sendPromptBtn").addEventListener("click", () => {
    const prompt = $("#promptInput").value.trim();
    if (!prompt) return;
    addMessage("user", prompt);
    applyPrompt(prompt);
  });
  $("#resetScenarioBtn").addEventListener("click", () => {
    state.scenario = defaultScenario(state.data);
    $("#promptInput").value = state.scenario.businessPurpose;
    syncScenarioToControls();
    renderChatInitial();
    rerenderWorkbench();
  });
  $$(".preset-card").forEach((button) => {
    button.addEventListener("click", () => {
      $("#promptInput").value = button.dataset.prompt;
      $("#sendPromptBtn").click();
    });
  });
  [
    "#projectName",
    "#businessPurpose",
    "#userCount",
    "#makerCount",
    "#adminCount",
    "#viewerCount",
    "#inputTokens",
    "#outputTokens",
    "#copilotMessages",
    "#logIngestionGb",
    "#dataverseGb",
    "#fxRate",
    "#existingM365E3",
    "#existingPowerApps",
    "#existingPowerAutomate",
    "#existingPowerBi",
  ].forEach((selector) => $(selector).addEventListener("input", () => rerenderWorkbench()));
  $$(".segment").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".segment").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.kind;
      renderDownloads(state.data?.outputs ?? []);
    });
  });
}

function showError(error) {
  setJobBadge({ status: "failed" });
  $("#jobLog").textContent = error.message || String(error);
}

bindEvents();
loadState().catch(showError);
