<template>
  <div class="app">
    <header>
      <h1>Shield</h1>
      <p>Browser tamper detection &amp; active content protection</p>
    </header>

    <!-- ── assess() panel ───────────────────────────────────────────── -->
    <section class="card">
      <div class="card-title">Environment Assessment</div>
      <p class="card-desc">
        Runs a one-shot detection pass and returns structured risk signals
        ready to attach to OpenTelemetry spans or pass into Scent's risk engine.
      </p>
      <div class="actions">
        <button class="btn-primary" :disabled="assessing" @click="runAssess">
          {{ assessing ? 'Assessing…' : 'Run assess()' }}
        </button>
        <button v-if="assessment" class="btn-secondary" @click="assessment = null">Reset</button>
      </div>

      <div v-if="assessment" class="assess-results">
        <!-- Signals -->
        <div class="signals-grid">
          <div v-for="(sig, key) in signalRows" :key="key" class="signal-row">
            <span class="signal-key">{{ sig.label }}</span>
            <span class="badge" :class="sig.threat ? 'badge-threat' : 'badge-safe'">
              {{ sig.threat ? sig.threatLabel : 'Clear' }}
            </span>
          </div>
        </div>

        <!-- Risk -->
        <div class="risk-block">
          <div class="risk-header">
            <span class="risk-label">Risk score</span>
            <span class="risk-score" :class="riskClass">{{ (assessment.risk.score * 100).toFixed(0) }}%</span>
          </div>
          <div class="risk-bar-track">
            <div class="risk-bar-fill" :class="riskClass" :style="{ width: (assessment.risk.score * 100) + '%' }"></div>
          </div>
          <div v-if="assessment.risk.flags.length" class="flags">
            <span v-for="f in assessment.risk.flags" :key="f" class="flag">{{ f }}</span>
          </div>
          <div v-else class="no-flags">No risk flags.</div>
        </div>

        <!-- Span attributes -->
        <details class="span-attrs">
          <summary>OTel span attributes <span class="attr-count">{{ Object.keys(assessment.spanAttributes).length }}</span></summary>
          <pre>{{ JSON.stringify(assessment.spanAttributes, null, 2) }}</pre>
        </details>
      </div>
    </section>

    <!-- ── assessAndProtect() policy engine ────────────────────────── -->
    <section class="card">
      <div class="card-title">Risk-Gated Policy Engine — assessAndProtect()</div>
      <p class="card-desc">
        Runs <code>assess()</code> then activates exactly the strategies each session
        warrants. Zero overhead for clean sessions; full defence for automation and
        high-risk visitors.
      </p>

      <!-- Policy rules preview -->
      <div class="policy-list">
        <div v-for="(rule, i) in displayPolicies" :key="i" class="policy-row"
             :class="{ 'policy-matched': policyResult && matchedRuleIndexes.has(i) }">
          <span class="policy-cond">{{ rule.condLabel }}</span>
          <span class="policy-arrow">→</span>
          <div class="policy-tags">
            <span v-for="s in rule.enable" :key="s" class="policy-tag">{{ s }}</span>
          </div>
          <span v-if="policyResult && matchedRuleIndexes.has(i)" class="policy-matched-badge">matched</span>
        </div>
      </div>

      <div class="actions" style="margin-top:1rem">
        <button class="btn-primary" :disabled="policyRunning" @click="runPolicyEngine">
          {{ policyRunning ? 'Assessing…' : 'Run assessAndProtect()' }}
        </button>
        <button v-if="policyResult" class="btn-secondary" @click="resetPolicy">Reset</button>
      </div>

      <div v-if="policyResult" class="policy-result">
        <div class="policy-result-row">
          <span>Risk score</span>
          <span class="risk-score" :class="policyRiskClass">
            {{ (policyResult.assessment.risk.score * 100).toFixed(0) }}%
          </span>
        </div>
        <div class="policy-result-row">
          <span>Matched rules</span>
          <span style="color:#e2e8f0">{{ matchedRuleIndexes.size }} / {{ displayPolicies.length }}</span>
        </div>
        <div class="policy-result-row">
          <span>Protection</span>
          <span class="badge" :class="policyResult.protector ? 'badge-threat' : 'badge-safe'">
            {{ policyResult.protector ? 'Active' : 'Not activated' }}
          </span>
        </div>
        <div v-if="policyActiveStrategies.length" class="policy-result-row">
          <span>Strategies</span>
          <div class="policy-tags">
            <span v-for="s in policyActiveStrategies" :key="s" class="policy-tag policy-tag-active">{{ s }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ── ContentProtector controls ────────────────────────────────── -->
    <section class="card">
      <div class="card-title">Active Content Protection</div>
      <div class="protect-header">
        <button :class="isProtected ? 'btn-danger' : 'btn-primary'" @click="toggleProtection">
          {{ isProtected ? 'Disable protection' : 'Enable protection' }}
        </button>
        <span class="status-pill" :class="isProtected ? 'pill-on' : 'pill-off'">
          {{ isProtected ? 'Protected' : 'Unprotected' }}
        </span>
      </div>

      <div class="options-grid">
        <div class="option-group">
          <div class="option-group-title">Content</div>
          <label class="opt"><input type="checkbox" v-model="opts.preventSelection" @change="updateOptions" /><span>Prevent selection</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.preventContextMenu" @change="updateOptions" /><span>Prevent context menu</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.preventKeyboardShortcuts" @change="updateOptions" /><span>Prevent keyboard shortcuts</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.preventScreenshots" @change="updateOptions" /><span>Prevent screenshots</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.preventFrameEmbedding" @change="updateOptions" /><span>Prevent frame embedding</span></label>
          <button v-if="opts.preventFrameEmbedding" class="btn-link" @click="openIframeTest">Test iframe ↗</button>
        </div>

        <div class="option-group">
          <div class="option-group-title">Document</div>
          <label class="opt"><input type="checkbox" v-model="opts.preventPrinting" @change="updateOptions" /><span>Prevent printing</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.preventDevTools" @change="updateOptions" /><span>Detect DevTools (overlay)</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.preventExtensions" @change="updateOptions" /><span>Detect extensions (overlay)</span></label>
          <label class="opt"><input type="checkbox" v-model="opts.debugMode" @change="updateOptions" /><span>Debug mode (console)</span></label>
        </div>

        <div class="option-group">
          <div class="option-group-title">Watermark</div>
          <label class="opt"><input type="checkbox" v-model="opts.enableWatermark" @change="updateOptions" /><span>Enable watermark</span></label>
          <div class="watermark-fields" :class="{ 'fields-disabled': !opts.enableWatermark }">
            <input class="text-input" type="text" v-model="opts.watermarkOptions.text" @change="updateOptions"
              placeholder="Watermark text" :disabled="!opts.enableWatermark" />
            <input class="text-input" type="text" v-model="opts.watermarkOptions.userId" @change="updateOptions"
              placeholder="User ID" :disabled="!opts.enableWatermark" />
            <label class="range-row">
              <span>Opacity</span>
              <input type="range" v-model.number="opts.watermarkOptions.opacity" min="0.1" max="1" step="0.1"
                @change="updateOptions" :disabled="!opts.enableWatermark" />
              <span class="range-val">{{ opts.watermarkOptions.opacity }}</span>
            </label>
            <label class="range-row">
              <span>Density</span>
              <input type="range" v-model.number="opts.watermarkOptions.density" min="1" max="10" step="1"
                @change="updateOptions" :disabled="!opts.enableWatermark" />
              <span class="range-val">{{ opts.watermarkOptions.density }}</span>
            </label>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Protected content ────────────────────────────────────────── -->
    <section class="card">
      <div class="card-title">Protected Content</div>
      <div ref="protectedContent" class="protected-area">
        <div class="content-section">
          <h3>Confidential data</h3>
          <p>This area is protected by <code>ContentProtector</code>. Try to right-click, select text,
            print (Ctrl+P), or open DevTools while protection is active.</p>
          <table class="data-table">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Email</th><th>Access</th></tr>
            </thead>
            <tbody>
              <tr v-for="u in sampleUsers" :key="u.id">
                <td>{{ u.id }}</td><td>{{ u.name }}</td><td>{{ u.email }}</td><td>{{ u.access }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="image-section">
          <h3>Protected image</h3>
          <img :src="shieldImg" alt="Shield" />
          <p class="img-caption">Right-click and save-as are blocked when protection is active.</p>
        </div>
      </div>
    </section>

    <!-- ── Events log ────────────────────────────────────────────────── -->
    <section class="card">
      <div class="card-title">Events log</div>
      <div class="log">
        <div v-if="!events.length" class="log-empty">No events yet — trigger a protected action above.</div>
        <div v-for="(e, i) in events" :key="i" class="log-row">
          <span class="log-time">{{ e.time }}</span>
          <span class="log-type" :class="'type-' + e.type.toLowerCase()">{{ e.type }}</span>
          <span class="log-msg">{{ e.message }}</span>
        </div>
      </div>
      <button class="btn-secondary" style="margin-top:0.75rem" @click="clearEvents">Clear log</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { assess, ContentProtector, assessAndProtect } from '@tindalabs/shield';
import type { ShieldAssessment, PolicyResult } from '@tindalabs/shield';
import shieldImg from './assets/shield.webp';

// ── assess() state ──────────────────────────────────────────────────────────
const assessing = ref(false);
const assessment = ref<ShieldAssessment | null>(null);

async function runAssess() {
  assessing.value = true;
  try {
    assessment.value = await assess({ timeout: 500 });
    logEvent('Assess', 'Assessment complete — risk score: ' + (assessment.value.risk.score * 100).toFixed(0) + '%');
  } finally {
    assessing.value = false;
  }
}

const signalRows = computed(() => {
  if (!assessment.value) return [];
  const s = assessment.value.signals;
  return [
    { label: 'DevTools open',    threat: s['shield.devtools.open'],          threatLabel: 'Open' },
    { label: 'WebDriver',        threat: s['shield.automation.webdriver'],    threatLabel: 'Detected' },
    { label: 'Headless browser', threat: s['shield.automation.headless'],     threatLabel: 'Detected' },
    { label: 'Frame embedded',   threat: s['shield.frame.embedded'],          threatLabel: 'Embedded' },
    { label: 'Extension',        threat: s['shield.extension.detected'],      threatLabel: s['shield.extension.names'] || 'Detected' },
  ];
});

const riskClass = computed(() => {
  if (!assessment.value) return '';
  const score = assessment.value.risk.score;
  if (score >= 0.7) return 'risk-critical';
  if (score >= 0.4) return 'risk-high';
  if (score >= 0.2) return 'risk-medium';
  return 'risk-low';
});

// ── assessAndProtect() policy engine ───────────────────────────────────────

const POLICIES = [
  {
    when: { riskScore: { gte: 0.2 } },
    enable: ['enableWatermark'] as const,
    watermarkOptions: (a: ShieldAssessment) => ({ text: `RISK-${Math.round(a.risk.score * 100)}` }),
    condLabel: 'riskScore ≥ 0.2',
  },
  {
    when: { riskScore: { gte: 0.5 } },
    enable: ['preventSelection', 'preventClipboard'] as const,
    condLabel: 'riskScore ≥ 0.5',
  },
  {
    when: { signals: { 'shield.automation.headless': true } },
    enable: ['preventContextMenu', 'preventKeyboardShortcuts'] as const,
    condLabel: 'headless = true',
  },
];

const displayPolicies = POLICIES;

const policyRunning  = ref(false);
const policyResult   = ref<PolicyResult | null>(null);
const matchedRuleIndexes = ref<Set<number>>(new Set());
const policyActiveStrategies = ref<string[]>([]);

const policyRiskClass = computed(() => {
  if (!policyResult.value) return '';
  const s = policyResult.value.assessment.risk.score;
  if (s >= 0.7) return 'risk-critical';
  if (s >= 0.4) return 'risk-high';
  if (s >= 0.2) return 'risk-medium';
  return 'risk-low';
});

let policyProtector: InstanceType<typeof ContentProtector> | null = null;

async function runPolicyEngine() {
  policyRunning.value = true;
  policyProtector?.dispose();
  policyProtector = null;
  matchedRuleIndexes.value = new Set();
  policyActiveStrategies.value = [];
  try {
    // Run with the protected-area element so the watermark appears in the right place
    const result = await assessAndProtect(protectedContent.value, {
      policies: POLICIES.map(({ when, enable, watermarkOptions }) =>
        watermarkOptions
          ? { when, enable: [...enable], watermarkOptions }
          : { when, enable: [...enable] }
      ),
    });
    policyResult.value = result;
    if (result.protector) {
      policyProtector = result.protector as InstanceType<typeof ContentProtector>;
    }
    // Reconstruct which rules matched for highlighting
    const matched = new Set<number>();
    const strategies = new Set<string>();
    const score = result.assessment.risk.score;
    const signals = result.assessment.signals;
    POLICIES.forEach((rule, i) => {
      const { riskScore, signals: sigCond } = rule.when as { riskScore?: { gte?: number; lt?: number }; signals?: Record<string, boolean> };
      let ok = true;
      if (riskScore?.gte !== undefined && score < riskScore.gte) ok = false;
      if (riskScore?.lt  !== undefined && score >= riskScore.lt)  ok = false;
      if (sigCond) {
        for (const [k, v] of Object.entries(sigCond)) {
          if ((signals as Record<string, unknown>)[k] !== v) { ok = false; break; }
        }
      }
      if (ok) {
        matched.add(i);
        rule.enable.forEach(s => strategies.add(s));
      }
    });
    matchedRuleIndexes.value = matched;
    policyActiveStrategies.value = [...strategies];
    logEvent('Policy', result.protector
      ? `Protection active — ${strategies.size} strateg${strategies.size === 1 ? 'y' : 'ies'} (score ${(score * 100).toFixed(0)}%)`
      : `No rules matched — session clean (score ${(score * 100).toFixed(0)}%)`,
    );
  } catch (e) {
    logEvent('Policy', `Error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    policyRunning.value = false;
  }
}

function resetPolicy() {
  policyProtector?.dispose();
  policyProtector = null;
  policyResult.value = null;
  matchedRuleIndexes.value = new Set();
  policyActiveStrategies.value = [];
}

// ── ContentProtector state ──────────────────────────────────────────────────
const protectedContent = ref<HTMLElement | null>(null);
const isProtected = ref(false);
let protector: InstanceType<typeof ContentProtector> | null = null;

const opts = reactive({
  preventSelection: true,
  preventContextMenu: true,
  contextMenuOptions: { observeForIframes: true },
  preventPrinting: true,
  preventKeyboardShortcuts: true,
  preventDevTools: false,
  devToolsOptions: {
    showOverlay: true,
    overlayOptions: {
      title: 'DEVELOPER TOOLS DETECTED',
      message: 'For security reasons, this content is not available while developer tools are open.',
      secondaryMessage: 'Please close developer tools to continue.',
      textColor: 'white',
      backgroundColor: 'rgba(99, 102, 241, 0.92)',
    },
    hideContent: true,
    checkFrequency: 1000,
  },
  preventScreenshots: true,
  screenshotOptions: {
    showOverlay: true,
    overlayOptions: {
      title: 'SCREENSHOT PROTECTED',
      message: 'Taking screenshots of this content is not permitted.',
      textColor: 'white',
      backgroundColor: 'rgba(99, 102, 241, 0.92)',
      fontSize: '40px',
      duration: 1000,
    },
    hideContent: true,
    preventFullscreen: true,
    fullscreenMessage: 'Fullscreen mode is disabled for security reasons',
  },
  enableWatermark: true,
  watermarkOptions: { text: 'CONFIDENTIAL', userId: 'user-123', opacity: 0.3, density: 2 },
  preventExtensions: true,
  extensionOptions: {
    detectionInterval: 2000,
    showOverlay: true as true,
    overlayOptions: {
      title: 'Extension Detected',
      message: 'Please disable content-scraping extensions to view this content.',
      backgroundColor: 'rgba(99, 102, 241, 0.92)',
      textColor: 'white',
    },
    hideContent: true,
  },
  preventFrameEmbedding: true,
  frameEmbeddingOptions: {
    showOverlay: true as true,
    overlayOptions: {
      title: 'Embedding Not Allowed',
      message: 'This content cannot be displayed in an embedded frame.',
      secondaryMessage: 'Please visit the original website.',
      textColor: 'white',
      backgroundColor: 'rgba(220, 38, 38, 0.9)',
    },
    hideContent: true,
    allowedDomains: ['trusted-partner.com'],
    blockAllFrames: true,
  },
  debugMode: false,
});

function buildHandlers() {
  return {
    onPrintAttempt:           ()              => logEvent('Print',     'Print attempt detected'),
    onContextMenuAttempt:     ()              => logEvent('ContextMenu','Context menu attempt'),
    onSelectionAttempt:       ()              => logEvent('Selection', 'Text selection attempt'),
    onKeyboardShortcutBlocked:(e: any)        => logEvent('Keyboard',  `Shortcut blocked: ${e?.key ?? '?'}`),
    onDevToolsOpen:           (open: boolean) => logEvent('DevTools',  `DevTools ${open ? 'opened' : 'closed'}`),
    onScreenshotAttempt:      ()              => logEvent('Screenshot','Screenshot attempt'),
    onExtensionDetected:      (_: string, name: string) => logEvent('Extension', `Extension: ${name}`),
    onFrameEmbeddingDetected: (_: boolean, ext: boolean) => logEvent('Frame', `Embedding detected (${ext ? 'external' : 'same-origin'})`),
  };
}

function buildProtector() {
  if (!protectedContent.value) return null;
  return new ContentProtector({
    targetElement: protectedContent.value,
    preventSelection: opts.preventSelection,
    preventContextMenu: opts.preventContextMenu,
    contextMenuOptions: opts.contextMenuOptions,
    preventPrinting: opts.preventPrinting,
    preventKeyboardShortcuts: opts.preventKeyboardShortcuts,
    preventDevTools: opts.preventDevTools,
    devToolsOptions: opts.devToolsOptions,
    preventScreenshots: opts.preventScreenshots,
    screenshotOptions: opts.screenshotOptions,
    enableWatermark: opts.enableWatermark,
    watermarkOptions: opts.watermarkOptions,
    preventExtensions: opts.preventExtensions,
    extensionOptions: opts.extensionOptions,
    preventEmbedding: opts.preventFrameEmbedding,
    frameEmbeddingOptions: opts.frameEmbeddingOptions,
    debugMode: opts.debugMode,
    customHandlers: buildHandlers(),
  });
}

onMounted(() => {
  protector = buildProtector();
  protector?.protect();
  isProtected.value = true;
  logEvent('System', 'Protection initialised');
});

onUnmounted(() => {
  protector?.unprotect();
  protector = null;
});

function toggleProtection() {
  if (isProtected.value) {
    protector?.unprotect();
    logEvent('System', 'Protection disabled');
  } else {
    protector = buildProtector();
    protector?.protect();
    logEvent('System', 'Protection enabled');
  }
  isProtected.value = !isProtected.value;
}

function updateOptions() {
  if (!protector) return;
  protector.updateOptions({
    preventSelection: opts.preventSelection,
    preventContextMenu: opts.preventContextMenu,
    preventPrinting: opts.preventPrinting,
    preventKeyboardShortcuts: opts.preventKeyboardShortcuts,
    preventDevTools: opts.preventDevTools,
    preventScreenshots: opts.preventScreenshots,
    enableWatermark: opts.enableWatermark,
    watermarkOptions: opts.watermarkOptions,
    preventExtensions: opts.preventExtensions,
    preventEmbedding: opts.preventFrameEmbedding,
    debugMode: opts.debugMode,
  });
  logEvent('System', 'Options updated');
}

function openIframeTest() {
  window.open('/embedding-demo.html', '_blank');
}

// ── Events log ──────────────────────────────────────────────────────────────
const events = ref<{ time: string; type: string; message: string }[]>([]);

function logEvent(type: string, message: string) {
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
  events.value.unshift({ time, type, message });
  if (events.value.length > 60) events.value.pop();
}

function clearEvents() {
  events.value = [];
}

// ── Sample data ─────────────────────────────────────────────────────────────
const sampleUsers = [
  { id: 'USR001', name: 'John Doe',       email: 'john.doe@example.com',    access: 'Admin'   },
  { id: 'USR002', name: 'Jane Smith',     email: 'jane.smith@example.com',  access: 'Manager' },
  { id: 'USR003', name: 'Robert Johnson', email: 'robert.j@example.com',    access: 'User'    },
  { id: 'USR004', name: 'Emily Davis',    email: 'emily.d@example.com',     access: 'User'    },
];
</script>

<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f1117;
  color: #e2e8f0;
  min-height: 100vh;
  padding: 2rem 1rem;
}

.app { max-width: 820px; margin: 0 auto; }

header { margin-bottom: 2.5rem; }
header h1 { font-size: 1.5rem; font-weight: 600; letter-spacing: -0.02em; color: #f8fafc; }
header p  { color: #94a3b8; font-size: 0.875rem; margin-top: 0.4rem; }

.card {
  background: #161b27;
  border: 1px solid #1e2d40;
  border-radius: 10px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1rem;
}
.card-title {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin-bottom: 0.75rem;
  font-weight: 600;
}
.card-desc { color: #94a3b8; font-size: 0.85rem; margin-bottom: 1rem; line-height: 1.5; }

.actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }

button {
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.45rem 1rem;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}
button:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary   { background: #6366f1; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #4f46e5; }
.btn-secondary { background: #1e2533; color: #94a3b8; border: 1px solid #2d3748; }
.btn-secondary:hover:not(:disabled) { background: #263044; }
.btn-danger    { background: #1e1e2e; color: #f87171; border: 1px solid #3d1f1f; }
.btn-danger:hover:not(:disabled) { background: #2d1f1f; }
.btn-link      { background: none; border: none; color: #818cf8; font-size: 0.8rem; padding: 0.3rem 0; cursor: pointer; }

/* ── assess results ── */
.assess-results { margin-top: 1.25rem; }

.signals-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
@media (max-width: 500px) { .signals-grid { grid-template-columns: 1fr; } }

.signal-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1a2235;
  border: 1px solid #1e2d40;
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  font-size: 0.83rem;
}
.signal-key { color: #94a3b8; }

.badge {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  letter-spacing: 0.03em;
}
.badge-safe   { background: #14532d; color: #86efac; }
.badge-threat { background: #450a0a; color: #fca5a5; }

.risk-block { margin-bottom: 1rem; }
.risk-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.4rem; }
.risk-label  { font-size: 0.83rem; color: #94a3b8; }
.risk-score  { font-size: 1rem; font-weight: 700; }
.risk-bar-track { height: 6px; background: #1e2d40; border-radius: 3px; overflow: hidden; margin-bottom: 0.6rem; }
.risk-bar-fill  { height: 100%; border-radius: 3px; transition: width 0.4s ease; }

.risk-low      { color: #86efac; }
.risk-low .risk-bar-fill, .risk-bar-fill.risk-low { background: #22c55e; }
.risk-medium   { color: #fde68a; }
.risk-medium .risk-bar-fill, .risk-bar-fill.risk-medium { background: #f59e0b; }
.risk-high     { color: #fca5a5; }
.risk-high .risk-bar-fill, .risk-bar-fill.risk-high { background: #ef4444; }
.risk-critical { color: #f87171; }
.risk-critical .risk-bar-fill, .risk-bar-fill.risk-critical { background: #dc2626; }

.flags { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.flag  { font-size: 0.72rem; padding: 0.2rem 0.5rem; background: #450a0a; color: #fca5a5; border-radius: 4px; }
.no-flags { font-size: 0.83rem; color: #475569; }

.span-attrs { margin-top: 0.75rem; border: 1px solid #1e2d40; border-radius: 6px; overflow: hidden; }
.span-attrs summary {
  padding: 0.5rem 0.75rem;
  font-size: 0.83rem;
  color: #64748b;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.span-attrs summary:hover { color: #94a3b8; }
.attr-count {
  background: #1e2d40;
  font-size: 0.68rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  color: #64748b;
}
.span-attrs pre {
  padding: 0.75rem;
  font-size: 0.78rem;
  color: #a5b4fc;
  background: #0f1117;
  overflow-x: auto;
  border-top: 1px solid #1e2d40;
}

/* ── Policy engine ── */
.policy-list { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
.policy-row {
  display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;
  background: #1a2235; border: 1px solid #1e2d40; border-radius: 6px;
  padding: 0.5rem 0.75rem; font-size: 0.82rem;
  transition: border-color 0.2s, background 0.2s;
}
.policy-row.policy-matched { border-color: #6366f1; background: #1a1f3a; }
.policy-cond  { color: #94a3b8; min-width: 140px; font-family: monospace; font-size: 0.78rem; }
.policy-arrow { color: #475569; }
.policy-tags  { display: flex; gap: 0.35rem; flex-wrap: wrap; flex: 1; }
.policy-tag   { font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 4px; background: #1e2d40; color: #64748b; }
.policy-tag-active { background: #1e3a4a; color: #7dd3fc; }
.policy-matched-badge {
  font-size: 0.68rem; font-weight: 600; padding: 0.15rem 0.45rem;
  border-radius: 4px; background: #2d1f3a; color: #a78bfa; margin-left: auto;
}
.policy-result {
  margin-top: 1rem; border-top: 1px solid #1e2d40; padding-top: 0.75rem;
  display: flex; flex-direction: column; gap: 0.45rem;
}
.policy-result-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.83rem; gap: 0.5rem;
}
.policy-result-row > span:first-child { color: #64748b; }

/* ── ContentProtector controls ── */
.protect-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
.status-pill { font-size: 0.75rem; font-weight: 600; padding: 0.2rem 0.65rem; border-radius: 20px; letter-spacing: 0.03em; }
.pill-on  { background: #14532d; color: #86efac; }
.pill-off { background: #1e2533; color: #64748b; }

.options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}
.option-group {
  background: #1a2235;
  border: 1px solid #1e2d40;
  border-radius: 8px;
  padding: 1rem;
}
.option-group-title {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #64748b;
  font-weight: 600;
  margin-bottom: 0.65rem;
}
.opt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.83rem;
  color: #94a3b8;
  margin-bottom: 0.5rem;
  cursor: pointer;
}
.opt input[type="checkbox"] { accent-color: #6366f1; width: 14px; height: 14px; cursor: pointer; }
.opt span { user-select: none; }

.watermark-fields { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed #1e2d40; }
.watermark-fields.fields-disabled { opacity: 0.45; pointer-events: none; }
.text-input {
  width: 100%;
  background: #0f1117;
  border: 1px solid #1e2d40;
  border-radius: 5px;
  color: #e2e8f0;
  font-size: 0.82rem;
  padding: 0.35rem 0.6rem;
  margin-bottom: 0.4rem;
}
.text-input::placeholder { color: #475569; }
.range-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #64748b;
  margin-bottom: 0.35rem;
}
.range-row span:first-child { min-width: 54px; }
.range-row input[type="range"] { flex: 1; accent-color: #6366f1; }
.range-val { min-width: 24px; text-align: right; color: #94a3b8; }

/* ── Protected content area ── */
.protected-area {
  background: #1a2235;
  border: 1px solid #1e2d40;
  border-radius: 8px;
  padding: 1.25rem;
}
.content-section { margin-bottom: 1.5rem; }
.content-section h3, .image-section h3 { font-size: 0.9rem; font-weight: 600; color: #e2e8f0; margin-bottom: 0.6rem; }
.content-section p { font-size: 0.83rem; color: #94a3b8; margin-bottom: 0.75rem; line-height: 1.55; }

.data-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.data-table th { background: #0f1117; color: #64748b; font-weight: 600; padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #1e2d40; }
.data-table td { padding: 0.5rem 0.75rem; color: #94a3b8; border-bottom: 1px solid #1a2235; }
.data-table tr:hover td { background: #0f1117; }

.image-section { text-align: center; }
.image-section img { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #1e2d40; max-height: 200px; object-fit: contain; }
.img-caption { font-size: 0.78rem; color: #475569; margin-top: 0.5rem; font-style: italic; }

/* ── Events log ── */
.log {
  background: #0f1117;
  border: 1px solid #1e2d40;
  border-radius: 6px;
  height: 200px;
  overflow-y: auto;
  padding: 0.5rem;
}
.log-empty { color: #475569; font-style: italic; font-size: 0.83rem; text-align: center; padding: 2rem; }
.log-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.35rem 0.4rem; border-bottom: 1px solid #1a2235; font-size: 0.8rem; }
.log-time { color: #475569; min-width: 62px; font-family: monospace; font-size: 0.75rem; }
.log-type { font-size: 0.68rem; font-weight: 600; padding: 0.15rem 0.45rem; border-radius: 4px; min-width: 70px; text-align: center; letter-spacing: 0.03em; }
.log-msg  { color: #94a3b8; flex: 1; }

.type-system    { background: #1e2d40; color: #64748b; }
.type-assess    { background: #1e3a4a; color: #7dd3fc; }
.type-devtools  { background: #2d1f1f; color: #fca5a5; }
.type-keyboard  { background: #2a1f2d; color: #d8b4fe; }
.type-print     { background: #1f2d20; color: #86efac; }
.type-contextmenu { background: #2d2a1f; color: #fde68a; }
.type-selection { background: #1f2535; color: #93c5fd; }
.type-screenshot { background: #2d1f2a; color: #f9a8d4; }
.type-extension { background: #2d2a1f; color: #fde68a; }
.type-frame     { background: #2d1f1f; color: #fca5a5; }
</style>
