const DEFAULT_PROMPT =
  "営業担当が過去提案書、FAQ、商談メモを検索して、提案書ドラフトと回答根拠を作れるAIエージェントを作りたい。Teamsから使いたい。120名でPoCしたい。";

const SKU_DEFS = {
  "SKU-M365-E3": {
    product_name: "Microsoft 365",
    sku_name: "E3",
    service_category: "Microsoft 365",
    billing_unit: "user/month",
    fallback_price: 36,
    reason: "Teams、SharePoint、Office文書、基本IDを業務基盤として使うため、対象利用者分を前提にします。",
  },
  "SKU-M365-E5": {
    product_name: "Microsoft 365",
    sku_name: "E5",
    service_category: "Microsoft 365",
    billing_unit: "user/month",
    fallback_price: 57,
    reason: "高度なセキュリティ、コンプライアンス、分析まで含める場合の上位候補です。",
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
    reason: "外部連携、承認、通知、バックエンド連携などのプレミアムフロー所有者に必要です。",
  },
  "SKU-COPILOTSTUDIO-MESSAGES": {
    product_name: "Copilot Studio",
    sku_name: "Messages / capacity",
    service_category: "Power Platform",
    billing_unit: "25,000 messages/month",
    fallback_price: 200,
    reason: "TeamsやWebから会話型エージェントを提供するため、月間メッセージ量に応じた容量を見込みます。",
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
    reason: "構造化した業務データ、履歴、設定値をDataverseに保持する場合の追加容量です。",
  },
  "SKU-AZURE-OPENAI-TOKENS": {
    product_name: "Azure OpenAI",
    sku_name: "gpt-4o-mini token usage",
    service_category: "Azure",
    billing_unit: "1K tokens",
    fallback_price: null,
    reason: "検索結果や業務文書の要約、回答生成、ドラフト作成に使うトークン従量課金です。",
  },
  "SKU-AZURE-FUNCTIONS": {
    product_name: "Azure Functions",
    sku_name: "Consumption",
    service_category: "Azure",
    billing_unit: "10 executions",
    fallback_price: 0.000002,
    reason: "軽量なAPI連携、整形処理、非同期ジョブをサーバーレスで実行する想定です。",
  },
  "SKU-AZURE-MONITOR": {
    product_name: "Azure Monitor",
    sku_name: "Log ingestion",
    service_category: "Azure",
    billing_unit: "GB/month",
    fallback_price: 3.34,
    reason: "エージェント利用ログ、エラー、監査ログを収集し、運用監視に使います。",
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

const BASE_SKUS = [
  "SKU-M365-E3",
  "SKU-COPILOTSTUDIO-MESSAGES",
  "SKU-AZURE-OPENAI-TOKENS",
  "SKU-AZURE-MONITOR",
];

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
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function looksMojibake(value) {
  return /繝|譁|蝟|蜩|逕|蜃|蛟|蠢|隕|謠|縺|雜/.test(String(value ?? ""));
}

function cleanText(value, fallback) {
  const text = String(value ?? "").trim();
  if (!text || looksMojibake(text)) return fallback;
  return text;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function existingQuantity(licenses, product, sku) {
  const productNeedle = product.toLowerCase();
  const skuNeedle = sku.toLowerCase();
  return (licenses ?? []).reduce((sum, license) => {
    const productName = String(license.product_name ?? "").toLowerCase();
    const skuName = String(license.sku_name ?? license.license_name ?? "").toLowerCase();
    const licenseName = String(license.license_name ?? "").toLowerCase();
    const productMatches = productName.includes(productNeedle) || productNeedle.includes(productName);
    const skuMatches = skuName.includes(skuNeedle) || licenseName.includes(skuNeedle);
    return productMatches && skuMatches ? sum + number(license.quantity) : sum;
  }, 0);
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
  for (const line of state.data?.lines ?? []) {
    const def = SKU_DEFS[line.sku_id] ?? {};
    if (!map.has(line.sku_id)) {
      map.set(line.sku_id, {
        sku_id: line.sku_id,
        ...def,
        product_name: line.product_name,
        sku_name: line.sku_name,
        service_category: line.service_category,
        billing_unit: line.billing_unit,
        unit_price_usd: Number.isFinite(line.unit_price_usd) ? line.unit_price_usd : def.fallback_price,
      });
    }
  }
  return map;
}

function defaultScenario(data) {
  const req = data?.requirements ?? {};
  const usage = req.monthly_usage_assumptions ?? {};
  const azure = usage.azure_openai ?? {};
  const licenses = data?.existingLicenses ?? [];
  const projectName = cleanText(data?.estimate?.project_name, "営業部向けAI業務支援PoC");
  const businessPurpose = cleanText(
    req.business_purpose,
    "営業担当が過去提案書、FAQ、商談メモを検索し、提案書ドラフトと回答根拠を作成できるAIエージェントを構築する。"
  );

  return {
    prompt: DEFAULT_PROMPT,
    projectName,
    businessPurpose,
    intent: "TeamsからCopilot Studioエージェントを利用し、SharePointのナレッジとAzure OpenAIを組み合わせて、回答生成・要約・提案書ドラフト作成を支援します。",
    selectedSkuIds: [
      "SKU-M365-E3",
      "SKU-COPILOTSTUDIO-MESSAGES",
      "SKU-AZURE-OPENAI-TOKENS",
      "SKU-POWERBI-PRO",
      "SKU-AZURE-MONITOR",
      "SKU-ENTRA-ID-P1",
    ],
    architecture: {
      channel: "Teams / Web",
      conversation: "Copilot Studio",
      app: "Power Apps",
      data: "SharePoint / Dataverse",
      ai: "Azure OpenAI",
      automation: "Power Automate / Functions",
      analytics: "Power BI",
      security: "Entra ID / Azure Monitor",
    },
    assumptions: [
      "提案前の概算であり、EA/CSP割引、税、契約条件は含めません。",
      "価格はSKUマスタの公式価格スナップショットを優先し、不足分は明示した仮単価で計算します。",
      "Microsoft 365 E3を既存保有している場合、SharePoint/Teams/基本IDの追加費用は既存分で控除します。",
    ],
    nfr: [
      "認証はEntra IDを前提にし、必要に応じて条件付きアクセスを設計します。",
      "利用ログ、エラー、監査ログはAzure Monitorに集約します。",
      "PoCでは月次利用量を設定値として管理し、本番前に実績値で再見積もりします。",
    ],
    userCount: number(req.user_count, 120),
    makerCount: number(req.maker_count, 15),
    adminCount: number(req.admin_count, 5),
    viewerCount: Math.max(existingQuantity(licenses, "Power BI", "Pro"), number(req.maker_count, 15), 30),
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

function inferScenario(prompt) {
  const text = String(prompt ?? "").toLowerCase();
  const has = (...words) => words.some((word) => text.includes(word.toLowerCase()));
  const skus = [...BASE_SKUS, "SKU-ENTRA-ID-P1"];
  const architecture = {
    channel: has("teams", "チームズ") ? "Teams" : "Teams / Web",
    conversation: "Copilot Studio",
    app: "Power Apps",
    data: "SharePoint",
    ai: "Azure OpenAI",
    automation: "Power Automate",
    analytics: "Power BI",
    security: "Entra ID / Azure Monitor",
  };

  let projectName = "AI業務支援エージェント";
  let intent = "Copilot Studioを入口に、Microsoft 365上の業務データとAzure OpenAIを組み合わせて、検索・要約・回答生成を支援します。";
  const assumptions = [
    "PoC段階では、対象部門と利用者数を固定した提案前概算として扱います。",
    "実利用量が変動するAzure OpenAI、Copilot Studio、ログ取り込みは右側の設定値で調整します。",
    "既存ライセンスは追加数量から控除し、足りない分だけ新規購入候補として表示します。",
  ];
  const nfr = [
    "認証・認可はEntra IDを基準にします。",
    "監査ログと利用ログはAzure Monitorに集約します。",
    "PoCではプロンプト、検索対象、回答根拠の品質を検証します。",
  ];

  if (has("稟議", "承認", "申請", "ワークフロー", "approval")) {
    projectName = "稟議検索・承認支援エージェント";
    intent = "過去稟議と承認履歴を検索し、類似案件、承認条件、注意点を提示したうえで、Power Automateで承認プロセスへ接続します。";
    architecture.app = "Power Apps";
    architecture.data = "Dataverse / SharePoint";
    architecture.automation = "Power Automate";
    skus.push("SKU-POWERAPPS-PREMIUM", "SKU-POWERAUTOMATE-PREMIUM", "SKU-DATAVERSE-CAPACITY");
    nfr.push("承認履歴は改ざん防止と追跡性を重視して設計します。");
  }

  if (has("営業", "提案", "商談", "faq", "ナレッジ", "rag", "検索", "回答根拠")) {
    projectName = "営業ナレッジAIエージェント";
    intent = "営業担当がTeamsから過去提案書、FAQ、商談メモを検索し、根拠付き回答と提案書ドラフトを生成できる構成にします。";
    architecture.data = "SharePoint / Dataverse";
    skus.push("SKU-POWERAUTOMATE-PREMIUM");
  }

  if (has("レポート", "dashboard", "bi", "kpi", "可視化", "分析")) {
    architecture.analytics = "Power BI";
    skus.push("SKU-POWERBI-PRO");
    nfr.push("利用状況と業務KPIを分けて、PoCの効果測定を行えるようにします。");
  }

  if (has("power apps", "アプリ", "フォーム", "入力画面", "dataverse")) {
    architecture.app = "Power Apps";
    architecture.data = "Dataverse / SharePoint";
    skus.push("SKU-POWERAPPS-PREMIUM", "SKU-DATAVERSE-CAPACITY");
  }

  if (has("api", "外部連携", "バッチ", "ジョブ", "連携")) {
    architecture.automation = "Power Automate / Azure Functions";
    skus.push("SKU-AZURE-FUNCTIONS", "SKU-POWERAUTOMATE-PREMIUM");
  }

  if (has("セキュリティ", "監査", "ログ", "defender", "端末")) {
    skus.push("SKU-DEFENDER-BUSINESS", "SKU-AZURE-MONITOR");
    nfr.push("監査・セキュリティ要件が強い場合はDefender系SKUとログ保持期間を別途確認します。");
  }

  if (has("地政学", "evidence", "根拠", "レポート")) {
    projectName = "Evidence Pack生成エージェント";
    intent = "レポートや外部情報を読み込み、要点、根拠、リスク、対応案をEvidence Packとして生成する構成にします。";
    architecture.data = "SharePoint / File store";
    skus.push("SKU-POWERBI-PRO", "SKU-POWERAUTOMATE-PREMIUM");
  }

  return {
    projectName,
    businessPurpose: prompt,
    prompt,
    intent,
    selectedSkuIds: unique(skus),
    architecture,
    assumptions,
    nfr,
  };
}

function syncScenarioToControls() {
  const scenario = state.scenario;
  $("#projectName").value = scenario.projectName;
  $("#businessPurpose").value = scenario.businessPurpose;
  $("#userCount").value = scenario.userCount;
  $("#makerCount").value = scenario.makerCount;
  $("#adminCount").value = scenario.adminCount;
  $("#viewerCount").value = scenario.viewerCount;
  $("#inputTokens").value = scenario.inputTokens;
  $("#outputTokens").value = scenario.outputTokens;
  $("#copilotMessages").value = scenario.copilotMessages;
  $("#logIngestionGb").value = scenario.logIngestionGb;
  $("#dataverseGb").value = scenario.dataverseGb;
  $("#fxRate").value = scenario.fxRate;
  $("#existingM365E3").value = scenario.existing.m365e3;
  $("#existingPowerApps").value = scenario.existing.powerApps;
  $("#existingPowerAutomate").value = scenario.existing.powerAutomate;
  $("#existingPowerBi").value = scenario.existing.powerBi;
}

function readControls() {
  const scenario = state.scenario;
  scenario.projectName = $("#projectName").value.trim() || "AI業務支援PoC";
  scenario.businessPurpose = $("#businessPurpose").value.trim() || scenario.businessPurpose;
  scenario.userCount = number($("#userCount").value);
  scenario.makerCount = number($("#makerCount").value);
  scenario.adminCount = number($("#adminCount").value);
  scenario.viewerCount = number($("#viewerCount").value);
  scenario.inputTokens = number($("#inputTokens").value);
  scenario.outputTokens = number($("#outputTokens").value);
  scenario.copilotMessages = number($("#copilotMessages").value);
  scenario.logIngestionGb = number($("#logIngestionGb").value);
  scenario.dataverseGb = number($("#dataverseGb").value);
  scenario.fxRate = number($("#fxRate").value, 155.2);
  scenario.existing.m365e3 = number($("#existingM365E3").value);
  scenario.existing.powerApps = number($("#existingPowerApps").value);
  scenario.existing.powerAutomate = number($("#existingPowerAutomate").value);
  scenario.existing.powerBi = number($("#existingPowerBi").value);
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
  const status = options.status ?? (additionalQuantity <= 0 || monthlyUsd === 0 ? "既存で充足" : "追加見込み");
  return {
    sku_id: skuId,
    product_name: meta.product_name,
    sku_name: meta.sku_name,
    service_category: meta.service_category,
    billing_unit: options.billingUnit ?? meta.billing_unit,
    required_quantity: requiredQuantity,
    existing_quantity: existingQuantity,
    additional_quantity: additionalQuantity,
    unit_price_usd: unitPriceUsd,
    monthly_usd: monthlyUsd,
    annual_usd: Number.isFinite(monthlyUsd) ? monthlyUsd * 12 : null,
    reason,
    status,
    statusKind: options.statusKind ?? (additionalQuantity <= 0 || monthlyUsd === 0 ? "covered" : "add"),
  };
}

function buildEstimateLines() {
  const s = state.scenario;
  const selected = new Set(s.selectedSkuIds);
  const lines = [];

  if (selected.has("SKU-M365-E3")) {
    lines.push(lineFor(
      "SKU-M365-E3",
      s.userCount,
      s.existing.m365e3,
      unitPrice("SKU-M365-E3"),
      SKU_DEFS["SKU-M365-E3"].reason
    ));
  }

  if (selected.has("SKU-POWERAPPS-PREMIUM")) {
    lines.push(lineFor(
      "SKU-POWERAPPS-PREMIUM",
      s.userCount,
      s.existing.powerApps,
      unitPrice("SKU-POWERAPPS-PREMIUM"),
      SKU_DEFS["SKU-POWERAPPS-PREMIUM"].reason
    ));
  }

  if (selected.has("SKU-POWERAUTOMATE-PREMIUM")) {
    const flowUsers = Math.max(s.makerCount, s.adminCount, 1);
    lines.push(lineFor(
      "SKU-POWERAUTOMATE-PREMIUM",
      flowUsers,
      s.existing.powerAutomate,
      unitPrice("SKU-POWERAUTOMATE-PREMIUM"),
      SKU_DEFS["SKU-POWERAUTOMATE-PREMIUM"].reason
    ));
  }

  if (selected.has("SKU-COPILOTSTUDIO-MESSAGES")) {
    const packs = Math.max(Math.ceil(s.copilotMessages / 25000), 1);
    lines.push(lineFor(
      "SKU-COPILOTSTUDIO-MESSAGES",
      packs,
      s.existing.copilotCapacity,
      unitPrice("SKU-COPILOTSTUDIO-MESSAGES"),
      SKU_DEFS["SKU-COPILOTSTUDIO-MESSAGES"].reason,
      { billingUnit: "25,000 messages/month" }
    ));
  }

  if (selected.has("SKU-POWERBI-PRO")) {
    const biUsers = Math.max(s.viewerCount, s.makerCount, 1);
    lines.push(lineFor(
      "SKU-POWERBI-PRO",
      biUsers,
      s.existing.powerBi,
      unitPrice("SKU-POWERBI-PRO"),
      SKU_DEFS["SKU-POWERBI-PRO"].reason
    ));
  }

  if (selected.has("SKU-DATAVERSE-CAPACITY") && s.dataverseGb > 0) {
    lines.push(lineFor(
      "SKU-DATAVERSE-CAPACITY",
      s.dataverseGb,
      0,
      unitPrice("SKU-DATAVERSE-CAPACITY"),
      SKU_DEFS["SKU-DATAVERSE-CAPACITY"].reason
    ));
  }

  if (selected.has("SKU-AZURE-OPENAI-TOKENS")) {
    const inputUsd = (s.inputTokens / 1000) * 0.00015;
    const outputUsd = (s.outputTokens / 1000) * 0.0006;
    lines.push(lineFor(
      "SKU-AZURE-OPENAI-TOKENS",
      1,
      0,
      inputUsd + outputUsd,
      SKU_DEFS["SKU-AZURE-OPENAI-TOKENS"].reason,
      {
        forceUsage: true,
        monthlyUsd: inputUsd + outputUsd,
        billingUnit: "monthly token usage",
        status: "従量課金",
        statusKind: "usage",
      }
    ));
  }

  if (selected.has("SKU-AZURE-FUNCTIONS")) {
    const executionUnits = Math.max(Math.ceil(s.functionExecutions / 10), 1);
    lines.push(lineFor(
      "SKU-AZURE-FUNCTIONS",
      executionUnits,
      0,
      unitPrice("SKU-AZURE-FUNCTIONS"),
      SKU_DEFS["SKU-AZURE-FUNCTIONS"].reason,
      { forceUsage: true, status: "従量課金", statusKind: "usage" }
    ));
  }

  if (selected.has("SKU-AZURE-MONITOR") && s.logIngestionGb > 0) {
    lines.push(lineFor(
      "SKU-AZURE-MONITOR",
      s.logIngestionGb,
      0,
      unitPrice("SKU-AZURE-MONITOR"),
      SKU_DEFS["SKU-AZURE-MONITOR"].reason,
      { forceUsage: true, status: "従量課金", statusKind: "usage" }
    ));
  }

  if (selected.has("SKU-ENTRA-ID-P1")) {
    const baseCovered = Math.max(s.existing.m365e3, selected.has("SKU-M365-E3") ? s.userCount : 0);
    lines.push(lineFor(
      "SKU-ENTRA-ID-P1",
      s.userCount,
      baseCovered,
      unitPrice("SKU-ENTRA-ID-P1"),
      SKU_DEFS["SKU-ENTRA-ID-P1"].reason,
      {
        monthlyUsd: 0,
        status: "M365 E3に含む前提",
        statusKind: "covered",
      }
    ));
  }

  if (selected.has("SKU-DEFENDER-BUSINESS")) {
    lines.push(lineFor(
      "SKU-DEFENDER-BUSINESS",
      s.userCount,
      0,
      unitPrice("SKU-DEFENDER-BUSINESS"),
      SKU_DEFS["SKU-DEFENDER-BUSINESS"].reason
    ));
  }

  return lines;
}

function renderMetrics(lines) {
  const monthlyUsd = lines.reduce((sum, line) => sum + (Number.isFinite(line.monthly_usd) ? line.monthly_usd : 0), 0);
  const annualUsd = monthlyUsd * 12;
  $("#monthlyUsd").textContent = usd(monthlyUsd);
  $("#monthlyJpy").textContent = jpy(monthlyUsd * state.scenario.fxRate);
  $("#annualUsd").textContent = usd(annualUsd);
  $("#additionalSkuCount").textContent = String(lines.filter((line) => line.additional_quantity > 0 && line.monthly_usd > 0).length);
  const pricingAsOf = state.data?.estimate?.pricing_as_of_label ?? state.data?.estimate?.pricing_as_of ?? "2026-06-14";
  $("#pricingAsOf").textContent = String(pricingAsOf).replace("T", " ").slice(0, 16);
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
      <td class="number">${usd(line.monthly_usd)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderArchitecture() {
  const a = state.scenario.architecture;
  const box = (x, y, w, h, title, body, color = "#ffffff") => `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${color}" stroke="#b8c5d1" />
    <text x="${x + 16}" y="${y + 26}" fill="#15212c" font-size="16" font-weight="700">${escapeHtml(title)}</text>
    <text x="${x + 16}" y="${y + 52}" fill="#536271" font-size="13">${escapeHtml(body)}</text>
  `;
  const arrow = (x1, y1, x2, y2) => `
    <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#587083" stroke-width="2" fill="none" marker-end="url(#arrow)" />
  `;
  $("#architectureCanvas").innerHTML = `
    <svg class="architecture-svg" viewBox="0 0 920 430" role="img" aria-label="Microsoftサービス構成図">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#587083"></path>
        </marker>
      </defs>
      <rect x="0" y="0" width="920" height="430" rx="12" fill="#f7fafc"></rect>
      ${box(34, 58, 170, 78, "利用者", a.channel, "#eef7f5")}
      ${box(260, 44, 190, 92, "会話・入口", a.conversation, "#eef3ff")}
      ${box(506, 44, 176, 92, "AI処理", a.ai, "#fff6df")}
      ${box(720, 44, 160, 92, "業務出力", "回答 / ドラフト", "#ffffff")}
      ${box(260, 192, 190, 92, "業務アプリ", a.app, "#ffffff")}
      ${box(506, 192, 176, 92, "データ", a.data, "#eef7f5")}
      ${box(720, 192, 160, 92, "可視化", a.analytics, "#eef3ff")}
      ${box(260, 326, 190, 64, "自動化", a.automation, "#ffffff")}
      ${box(506, 326, 374, 64, "認証・監視", a.security, "#f8eef2")}
      ${arrow(204, 97, 260, 97)}
      ${arrow(450, 97, 506, 97)}
      ${arrow(682, 97, 720, 97)}
      ${arrow(355, 136, 355, 192)}
      ${arrow(450, 238, 506, 238)}
      ${arrow(682, 238, 720, 238)}
      ${arrow(355, 284, 355, 326)}
      ${arrow(450, 358, 506, 358)}
      ${arrow(594, 192, 594, 136)}
    </svg>
  `;
  $("#architectureSubtitle").textContent = `${state.scenario.projectName} の提案構成`;
  $("#proposalIntent").textContent = state.scenario.intent;
  renderList("#assumptionList", state.scenario.assumptions);
  renderList("#nfrList", state.scenario.nfr);
}

function renderList(selector, items) {
  const list = $(selector);
  list.innerHTML = "";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
}

function renderChatInitial() {
  const log = $("#chatLog");
  log.innerHTML = "";
  addMessage("ai", "どんな業務システムを作りたいかを入力してください。用途、利用者数、Teams利用、AI要約、承認フロー、レポート有無などが分かると、構成図とライセンス試算を組み替えます。");
}

function addMessage(role, body, bullets = []) {
  const row = document.createElement("div");
  row.className = `message ${role}`;
  const title = role === "user" ? "あなた" : "AI";
  row.innerHTML = `<strong>${title}</strong><div>${escapeHtml(body)}</div>`;
  if (bullets.length > 0) {
    const ul = document.createElement("ul");
    for (const bullet of bullets) {
      const li = document.createElement("li");
      li.textContent = bullet;
      ul.appendChild(li);
    }
    row.appendChild(ul);
  }
  $("#chatLog").appendChild(row);
  $("#chatLog").scrollTop = $("#chatLog").scrollHeight;
}

function applyPrompt(prompt) {
  const inferred = inferScenario(prompt);
  state.scenario = {
    ...state.scenario,
    ...inferred,
    architecture: {
      ...state.scenario.architecture,
      ...inferred.architecture,
    },
  };
  syncScenarioToControls();
  rerenderWorkbench();
  addMessage("ai", "この要件なら、まず下記のMicrosoft構成で概算するのがよさそうです。右側の人数や利用量を動かすと、必要数量と費用が即時に変わります。", [
    `入口: ${state.scenario.architecture.channel} + ${state.scenario.architecture.conversation}`,
    `データ: ${state.scenario.architecture.data}`,
    `AI/自動化: ${state.scenario.architecture.ai} + ${state.scenario.architecture.automation}`,
  ]);
}

function rerenderWorkbench() {
  readControls();
  const lines = buildEstimateLines();
  renderMetrics(lines);
  renderLines(lines);
  renderArchitecture();
  $("#estimateNote").textContent = `価格はUSD公式ベースを優先し、JPYは ${state.scenario.fxRate.toLocaleString("ja-JP")} 円/USDで換算。税・割引は含みません。`;
}

function selectedCapabilities() {
  const ids = new Set(state.scenario.selectedSkuIds);
  const capabilities = ["Microsoft 365 document collaboration"];
  if (ids.has("SKU-M365-E3")) capabilities.push("SharePoint knowledge base", "Teams collaboration");
  if (ids.has("SKU-POWERAPPS-PREMIUM")) capabilities.push("Power Apps business app");
  if (ids.has("SKU-POWERAUTOMATE-PREMIUM")) capabilities.push("Power Automate workflow");
  if (ids.has("SKU-COPILOTSTUDIO-MESSAGES")) capabilities.push("Copilot Studio agent");
  if (ids.has("SKU-AZURE-OPENAI-TOKENS")) capabilities.push("Azure OpenAI summarization", "RAG search", "AI draft generation");
  if (ids.has("SKU-POWERBI-PRO")) capabilities.push("Power BI reporting");
  if (ids.has("SKU-DATAVERSE-CAPACITY")) capabilities.push("Dataverse data storage");
  if (ids.has("SKU-AZURE-MONITOR")) capabilities.push("Audit and security monitoring");
  if (ids.has("SKU-ENTRA-ID-P1")) capabilities.push("Microsoft Entra ID authentication");
  if (ids.has("SKU-DEFENDER-BUSINESS")) capabilities.push("Endpoint security");
  return unique(capabilities);
}

function existingLicensesPayload() {
  return [
    {
      existing_license_id: "EL-001",
      license_name: "Microsoft 365 E3",
      product_name: "Microsoft 365",
      sku_name: "E3",
      quantity: state.scenario.existing.m365e3,
      assigned_scope: "全社またはPoC対象部門",
      applicable_services: ["SharePoint Online", "Teams", "Office apps", "Exchange Online", "Entra ID P1"],
      notes: "ダッシュボード入力値",
    },
    {
      existing_license_id: "EL-002",
      license_name: "Power BI Pro",
      product_name: "Power BI",
      sku_name: "Pro",
      quantity: state.scenario.existing.powerBi,
      assigned_scope: "レポート作成者・閲覧者",
      applicable_services: ["Power BI"],
      notes: "ダッシュボード入力値",
    },
    {
      existing_license_id: "EL-003",
      license_name: "Power Apps Premium",
      product_name: "Power Apps",
      sku_name: "Premium",
      quantity: state.scenario.existing.powerApps,
      assigned_scope: "アプリ利用者・作成者",
      applicable_services: ["Power Apps", "Dataverse"],
      notes: "ダッシュボード入力値",
    },
    {
      existing_license_id: "EL-004",
      license_name: "Power Automate Premium",
      product_name: "Power Automate",
      sku_name: "Premium",
      quantity: state.scenario.existing.powerAutomate,
      assigned_scope: "フロー所有者",
      applicable_services: ["Power Automate"],
      notes: "ダッシュボード入力値",
    },
  ].filter((license) => number(license.quantity) > 0);
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
    proposal_intent: state.scenario.intent,
    assumptions: state.scenario.assumptions,
    nfr: state.scenario.nfr,
  };
}

async function saveInput() {
  setJobBadge({ status: "running" });
  $("#jobLog").textContent = "現在の壁打ち条件を保存中...";
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
  } catch (error) {
    state.staticMode = true;
    localStorage.setItem("ms-license-navi-input", JSON.stringify(inputPayload()));
    setJobBadge({ status: "ok" });
    $("#jobLog").textContent = "ブラウザ内に保存しました。GitHub Pages版ではサーバー保存は行いません。";
  }
}

function selectedFormats() {
  return $$('input[name="format"]:checked').map((input) => input.value);
}

async function generate() {
  const button = $("#generateBtn");
  button.disabled = true;
  try {
    await saveInput();
    if (state.staticMode) {
      generateStaticDownloads();
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

function proposalMarkdown() {
  const lines = buildEstimateLines();
  const monthlyUsd = lines.reduce((sum, line) => sum + (Number.isFinite(line.monthly_usd) ? line.monthly_usd : 0), 0);
  const s = state.scenario;
  return [
    `# ${s.projectName}`,
    "",
    "## ユースケース",
    s.businessPurpose,
    "",
    "## AI提案アーキテクチャ",
    `- 入口: ${s.architecture.channel}`,
    `- 会話: ${s.architecture.conversation}`,
    `- 業務アプリ: ${s.architecture.app}`,
    `- データ: ${s.architecture.data}`,
    `- AI: ${s.architecture.ai}`,
    `- 自動化: ${s.architecture.automation}`,
    `- 可視化: ${s.architecture.analytics}`,
    `- 認証・監視: ${s.architecture.security}`,
    "",
    "## 概算コスト",
    `- 月額USD: ${usd(monthlyUsd)}`,
    `- 月額JPY: ${jpy(monthlyUsd * s.fxRate)}`,
    `- 年額USD: ${usd(monthlyUsd * 12)}`,
    `- 換算レート: ${s.fxRate} JPY/USD`,
    "",
    "## ライセンス・Azure明細",
    "| サービス / SKU | 必要数 | 既存 | 追加 | 月額USD | 理由 |",
    "|---|---:|---:|---:|---:|---|",
    ...lines.map((line) => `| ${line.product_name} / ${line.sku_name} | ${line.required_quantity} | ${line.existing_quantity} | ${line.additional_quantity} | ${usd(line.monthly_usd)} | ${line.reason} |`),
    "",
    "## 前提",
    ...s.assumptions.map((item) => `- ${item}`),
    "",
    "## 非機能観点",
    ...s.nfr.map((item) => `- ${item}`),
    "",
    `> 価格は ${state.data?.estimate?.pricing_as_of_label ?? "2026-06-14"} 時点のSKUマスタを基準にした提案前概算です。税、割引、契約条件は含みません。`,
    "",
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

function generateStaticDownloads() {
  const formats = selectedFormats();
  const slug = state.scenario.projectName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "-") || "ms-license-estimate";
  if (formats.includes("markdown")) {
    downloadText(`${slug}.md`, proposalMarkdown(), "text/markdown;charset=utf-8");
  }
  if (formats.includes("azureMeter") || formats.includes("audit")) {
    downloadText(`${slug}.json`, JSON.stringify(inputPayload(), null, 2), "application/json;charset=utf-8");
  }
  setJobBadge({ status: "ok" });
  $("#jobLog").textContent = [
    "GitHub Pages静的版として生成しました。",
    "Markdown/JSONはブラウザで即時ダウンロードします。",
    "Excel/PowerPointはサーバー生成が必要なため、下の同梱済み成果物からダウンロードしてください。",
  ].join("\n");
}

function setJobBadge(job) {
  const badge = $("#jobBadge");
  const status = job?.status ?? "idle";
  badge.textContent = status;
  badge.className = `status-pill ${status}`;
}

function renderJob(job) {
  setJobBadge(job);
  if (!job || job.status === "idle") {
    $("#jobLog").textContent = "生成待機中";
    return;
  }
  const lines = [
    `status: ${job.status}`,
    job.startedAt ? `started: ${job.startedAt}` : "",
    job.finishedAt ? `finished: ${job.finishedAt}` : "",
    job.error ? `error: ${job.error}` : "",
    "",
    ...(job.steps ?? []).map((step) => [
      `[${step.status}] ${step.label}`,
      step.stdout ? step.stdout : "",
      step.stderr ? step.stderr : "",
    ].filter(Boolean).join("\n")),
  ].filter(Boolean);
  $("#jobLog").textContent = lines.join("\n\n");
}

function kindVisible(file) {
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
  for (const file of visible.slice(0, 24)) {
    const row = document.createElement("div");
    row.className = "download-row";
    row.innerHTML = `
      <div>
        <strong title="${escapeHtml(file.relative)}">${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.kind)} · ${bytes(file.bytes)} · ${modifiedLabel(file.modifiedAt)}</span>
      </div>
      <a class="download-link" href="${file.downloadUrl}">Download</a>
    `;
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
        architecture: savedInput.architecture ?? state.scenario.architecture,
        intent: savedInput.proposal_intent ?? state.scenario.intent,
        assumptions: savedInput.assumptions ?? state.scenario.assumptions,
        nfr: savedInput.nfr ?? state.scenario.nfr,
      };
    } catch {
      localStorage.removeItem("ms-license-navi-input");
    }
  }
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
    syncScenarioToControls();
    renderChatInitial();
    rerenderWorkbench();
  });
  $$(".chip").forEach((button) => {
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
  ].forEach((selector) => {
    $(selector).addEventListener("input", () => rerenderWorkbench());
  });
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
