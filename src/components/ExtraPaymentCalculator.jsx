// Step 10: Extra Payment Magic tab — parity-hardened, derived-on-render.
//
// Step 8 created this tab. Step 10 completes its parity work:
//
//   1. The displayed result is now derived on every render from the raw
//      field strings + extra mode + P&I-override flag by the pure
//      `deriveExtraPaymentResult` (src/lib/extraPayment.js) — the same
//      derive-on-render pattern Step 9 applied to the main calculator,
//      and AGENTS.md's "Do not store redundant calculated values in
//      state". No `result` object is stored in state.
//
//   2. Decision F7 (approved in the Step 10 request): a simulation that
//      hits the 600-month cap without paying off — or a payment that
//      does not cover the first month's interest — is surfaced as an
//      explicit `limitWarning` with a trailing '+' on the truncated
//      duration, so an unpaid loan is never presented as fully paid off.
//
//   3. Parity restorations against the original script.js:
//      - the `magicMonthlyPI` focus guard (the original never overwrote
//        a focused field) is restored via the ref;
//      - the loan term is read from the text input ONLY — the original
//        `getElementById('magicTerm')` returned the first element in
//        document order (the text input); the select was dead UI
//        (decision F4, unresolved);
//      - the tab sync re-runs on EVERY switch to this tab while the
//        magic price field is empty (the original navExtra handler had
//        no one-time latch), writes the raw principal unconditionally,
//        and never touches the dead select;
//      - the original blur formatters (thousands separators on the
//        seven currency fields, no recalculation) are restored.
//
//   4. Documented deviations (see MIGRATION_STATUS.md, Step 10):
//      - a validation error resets the result cards to the all-sentinel
//        values (consistent with the Step 9 main calculator; the
//        original kept previously displayed values on error);
//      - the sessionStorage-gated magic demo is NOT ported yet — it is
//        Step 12's scope. (Step 8 note #3 was wrong to say it was
//        unreachable in the original: the navExtra handler called
//        runMagicDemo() whenever the magic price was empty.)
//
// The DOM structure, CSS classes, and aria attributes are unchanged from
// Step 8 / the original index.html.

import { useEffect, useRef, useState } from 'react';
import { parseNumeric } from '../lib/validation.js';
import {
  deriveExtraPaymentResult,
  applyPIAutoFill,
  CORE_MAGIC_KEYS,
} from '../lib/extraPayment.js';

export default function ExtraPaymentCalculator({ mainInputs, seedNonce }) {
  const [magicInputs, setMagicInputs] = useState({
    magicPrice: '',
    magicDownPayment: '',
    magicBalance: '',
    magicRate: '',
    magicTermText: '',
    magicTax: '',
    magicInsurance: '',
    magicMonthlyPI: '',
    extraAmount: '',
  });
  const [extraMode, setExtraMode] = useState('monthly');
  // Whether the P&I field currently holds a user-entered value the
  // original would honor (a calculateMagic(true) event with value > 0).
  // The simulation must use the UNROUNDED calculated P&I whenever this
  // is false — even when the field displays the rounded auto-filled
  // value — exactly as the original used `calculatedPI` whenever its
  // fill branch ran.
  const [piIsManual, setPiIsManual] = useState(false);
  const magicMonthlyPIRef = useRef(null);

  // Derived on every render — never stored (AGENTS.md / Step 9 pattern).
  // The magic tab recalculated live on every input in the original, so
  // the draft strings are the derivation inputs.
  const result = deriveExtraPaymentResult(magicInputs, extraMode, piIsManual);

  function piIsFocused() {
    return (
      typeof document !== 'undefined' &&
      document.activeElement === magicMonthlyPIRef.current
    );
  }

  // Original: every `input` on a magic field re-ran calculateMagic —
  // calculateMagic(false) for the core fields, calculateMagic(true) for
  // the rest. The term select is dead UI (no listener in the original).
  function handleMagicInput(key, value) {
    const next = { ...magicInputs, [key]: value };
    const isCore = CORE_MAGIC_KEYS.has(key);
    const { inputs: filled, filledPI } = applyPIAutoFill(next, {
      force: isCore,
      isFocused: piIsFocused(),
    });
    setMagicInputs(filled);
    setPiIsManual(!isCore && !filledPI && parseNumeric(filled.magicMonthlyPI) > 0);
  }

  // Original `magicCalcBtn` click: calculateMagic() → isPIOverride=false
  // → contractual P&I re-derived and the field rewritten (unless focused).
  function handleCalculate() {
    const { inputs: filled } = applyPIAutoFill(magicInputs, {
      force: true,
      isFocused: piIsFocused(),
    });
    if (filled !== magicInputs) setMagicInputs(filled);
    setPiIsManual(false);
  }

  // Original extraMonthlyBtn / extraOneTimeBtn: set extraMode, then
  // calculateMagic() (isPIOverride=false) with the new mode in effect.
  function selectExtraMode(mode) {
    if (mode === extraMode) return;
    setExtraMode(mode);
    const { inputs: filled } = applyPIAutoFill(magicInputs, {
      force: true,
      isFocused: piIsFocused(),
    });
    if (filled !== magicInputs) setMagicInputs(filled);
    setPiIsManual(false);
  }

  // Original blur listeners on the seven currency fields: reformat with
  // thousands separators (en-US) without recalculating.
  function handleMagicBlur(key, rawValue) {
    const val = parseNumeric(rawValue);
    if (val > 0) {
      setMagicInputs((prev) => ({ ...prev, [key]: val.toLocaleString('en-US') }));
    }
  }

  // One-way Calculator → Magic sync. Re-run on EVERY switch to this tab
  // (the original navExtra handler had no latch; the "only once" effect
  // came from the "magic price must be empty" gate, so a manually
  // cleared magic price re-syncs on the next switch — preserved).
  useEffect(() => {
    if (seedNonce <= 0) return;
    const mainPrice = parseNumeric(mainInputs.price);
    if (mainPrice <= 0) return;
    if (parseNumeric(magicInputs.magicPrice) > 0) return;

    // Original: magicBalance.value = principal.toLocaleString('en-US')
    // unconditionally (it can be non-positive when down ≥ price); the
    // validation gate below then rejects the form.
    const principal = mainPrice - parseNumeric(mainInputs.downPayment);
    const next = {
      ...magicInputs,
      magicPrice: mainInputs.price,
      magicDownPayment: mainInputs.downPayment,
      magicBalance: principal.toLocaleString('en-US'),
      magicRate: mainInputs.rate,
      magicTermText: String(mainInputs.term || ''),
      magicTax: mainInputs.tax,
      magicInsurance: mainInputs.insurance,
    };
    // Original: calculateMagic() → isPIOverride=false.
    const { inputs: filled } = applyPIAutoFill(next, {
      force: true,
      isFocused: piIsFocused(),
    });
    setMagicInputs(filled);
    setPiIsManual(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedNonce]);

  return (
    <>
      <article className="calc-card">
        <div
          className="badge"
          style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '4px 12px',
            borderRadius: '99px',
            fontSize: '0.75rem',
            fontWeight: 700,
            display: 'inline-block',
            marginBottom: '12px',
          }}
        >
          NEW FEATURE
        </div>
        <h1>
          Extra Payment <span style={{ color: 'var(--secondary)' }}>Magic</span>
        </h1>
        <p className="subtitle">
          See how much time and interest you can save by paying a little extra.
        </p>

        <div className="row">
          <div className="input-group">
            <label htmlFor="magicTermText">Original Loan Term (Years)</label>
            <div className="input-wrapper">
              <i className="fas fa-calendar-alt"></i>
              <input
                type="text"
                id="magicTermText"
                placeholder="30"
                aria-label="Original Loan Term"
                value={magicInputs.magicTermText}
                onChange={(e) => handleMagicInput('magicTermText', e.target.value)}
              />
            </div>
          </div>
          <div className="input-group">
            <label
              htmlFor="magicMonthlyPI"
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Monthly P&amp;I Payment ($)
              <div className="tooltip-container">
                <i
                  className="fas fa-info-circle"
                  style={{ fontSize: '0.8rem', cursor: 'help', color: 'var(--text-muted)' }}
                ></i>
                <span className="tooltip-text">
                  We calculated this based on your original loan. Change this if
                  your actual monthly payment is different.
                </span>
              </div>
            </label>
            <div className="input-wrapper">
              <i className="fas fa-file-invoice-dollar" style={{ color: 'var(--primary)' }}></i>
              <input
                type="text"
                id="magicMonthlyPI"
                placeholder="2,500"
                aria-label="Monthly Principal and Interest"
                value={magicInputs.magicMonthlyPI}
                ref={magicMonthlyPIRef}
                onChange={(e) => handleMagicInput('magicMonthlyPI', e.target.value)}
                onBlur={(e) => handleMagicBlur('magicMonthlyPI', e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="input-group">
          <label htmlFor="magicBalance">Current Loan Balance ($)</label>
          <div className="input-wrapper">
            <i className="fas fa-money-bill-trend-up" style={{ color: 'var(--secondary)' }}></i>
            <input
              type="text"
              id="magicBalance"
              placeholder="515,000"
              aria-label="Current Loan Balance"
              value={magicInputs.magicBalance}
              onChange={(e) => handleMagicInput('magicBalance', e.target.value)}
              onBlur={(e) => handleMagicBlur('magicBalance', e.target.value)}
            />
          </div>
        </div>

        <div className="row">
          <div className="input-group">
            <label htmlFor="magicPrice">Home Price ($)</label>
            <div className="input-wrapper">
              <i className="fas fa-home"></i>
              <input
                type="text"
                id="magicPrice"
                placeholder="600,000"
                aria-label="Home Purchase Price"
                value={magicInputs.magicPrice}
                onChange={(e) => handleMagicInput('magicPrice', e.target.value)}
                onBlur={(e) => handleMagicBlur('magicPrice', e.target.value)}
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="magicDownPayment">Down Payment ($)</label>
            <div className="input-wrapper">
              <i className="fas fa-hand-holding-usd"></i>
              <input
                type="text"
                id="magicDownPayment"
                placeholder="105,000"
                aria-label="Down Payment Amount"
                value={magicInputs.magicDownPayment}
                onChange={(e) => handleMagicInput('magicDownPayment', e.target.value)}
                onBlur={(e) => handleMagicBlur('magicDownPayment', e.target.value)}
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="magicRate">Interest Rate (%)</label>
            <div className="input-wrapper">
              <i className="fas fa-percentage"></i>
              <input
                type="text"
                id="magicRate"
                placeholder="6.5"
                aria-label="Annual Interest Rate"
                value={magicInputs.magicRate}
                onChange={(e) => handleMagicInput('magicRate', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div className="input-group">
            <label htmlFor="magicTermSelect">Loan Term (Years)</label>
            <div className="input-wrapper">
              <i className="fas fa-calendar-alt"></i>
              {/* Dead control, exactly as in the original: the duplicated
                  id="magicTerm" meant getElementById always returned the
                  text input above, and the select had no listeners. It is
                  intentionally uncontrolled and never read (F4). */}
              <select
                id="magicTermSelect"
                defaultValue="30"
                aria-label="Loan Term in Years"
              >
                <option value="15">15 Years</option>
                <option value="30">30 Years</option>
                <option value="20">20 Years</option>
                <option value="10">10 Years</option>
              </select>
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="magicTax">Property Tax (Annual $)</label>
            <div className="input-wrapper">
              <i className="fas fa-landmark"></i>
              <input
                type="text"
                id="magicTax"
                placeholder="5,500"
                aria-label="Annual Property Tax"
                value={magicInputs.magicTax}
                onChange={(e) => handleMagicInput('magicTax', e.target.value)}
                onBlur={(e) => handleMagicBlur('magicTax', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="row">
          <div className="input-group">
            <label htmlFor="magicInsurance">Home Insurance (Annual $)</label>
            <div className="input-wrapper">
              <i className="fas fa-shield-alt"></i>
              <input
                type="text"
                id="magicInsurance"
                placeholder="1,200"
                aria-label="Annual Homeowners Insurance"
                value={magicInputs.magicInsurance}
                onChange={(e) => handleMagicInput('magicInsurance', e.target.value)}
                onBlur={(e) => handleMagicBlur('magicInsurance', e.target.value)}
              />
            </div>
          </div>
          <div className="input-group">
            <div
              className="label-row"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}
            >
              <label htmlFor="extraAmount" style={{ marginBottom: 0 }}>
                Extra Payment
              </label>
              <div className="toggle-group" style={{ display: 'flex', gap: '5px' }}>
                <button
                  type="button"
                  className={'toggle-btn' + (extraMode === 'monthly' ? ' active' : '')}
                  onClick={() => selectExtraMode('monthly')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={'toggle-btn' + (extraMode === 'one-time' ? ' active' : '')}
                  onClick={() => selectExtraMode('one-time')}
                >
                  One-time
                </button>
              </div>
            </div>
            <div className="input-wrapper">
              <i className="fas fa-magic" style={{ color: 'var(--secondary)' }}></i>
              <input
                type="text"
                id="extraAmount"
                placeholder="200"
                aria-label="Extra Payment Amount"
                value={magicInputs.extraAmount}
                onChange={(e) => handleMagicInput('extraAmount', e.target.value)}
                onBlur={(e) => handleMagicBlur('extraAmount', e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          className="btn-calc"
          type="button"
          style={{ background: 'var(--secondary)' }}
          onClick={handleCalculate}
        >
          <i className="fas fa-wand-magic-sparkles"></i>
          {' '}
          Calculate Savings
        </button>

        <div
          className="error-msg"
          role="alert"
          style={result.errorMsg ? { display: 'block' } : { display: 'none' }}
        >
          {result.errorMsg}
        </div>
        {/* F7 (approved): explicit non-payoff warning for non-amortizing
            payments and the 600-month simulation limit. Reuses the
            .error-msg layout with an amber (non-error) palette. */}
        <div
          className="error-msg"
          role="status"
          style={
            result.limitWarning
              ? { display: 'block', background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }
              : { display: 'none' }
          }
        >
          {result.limitWarning}
        </div>
      </article>

      <aside className="results-card">
        <div
          className="calc-card"
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            borderColor: 'rgba(16, 185, 129, 0.2)',
            textAlign: 'center',
          }}
        >
          <div className="payment-label" style={{ color: 'var(--secondary)' }}>
            Total Interest Saved
          </div>
          <div className="payment-amount" style={{ color: 'var(--secondary)' }}>
            {result.interestSaved}
          </div>
          <div
            className="pi-sub-label"
            style={{
              fontSize: '1rem',
              color: '#fff',
              marginTop: '10px',
              fontWeight: 600,
            }}
          >
            Time Saved:{' '}
            <span style={{ color: 'var(--secondary)' }}>{result.timeSaved}</span>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card" style={{ borderColor: 'var(--glass-border)' }}>
            <div
              className="label"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              Normally Remaining
              <div className="tooltip-container">
                <i
                  className="fas fa-info-circle"
                  style={{
                    fontSize: '0.8rem',
                    cursor: 'help',
                    color: 'var(--text-muted)',
                  }}
                ></i>
                <span className="tooltip-text">
                  Forward-looking simulation: Based on your current balance and
                  original fixed P&amp;I payment. This is the exact time left if
                  you make no more extra payments.
                </span>
              </div>
            </div>
            <div className="value" style={{ color: 'var(--text-muted)' }}>
              {result.standardRemaining}
            </div>
          </div>
          <div className="stat-card" style={{ borderColor: 'var(--secondary)' }}>
            <div className="label">New Payoff Time</div>
            <div className="value">{result.newPayoffTime}</div>
          </div>
          <div className="stat-card">
            <div className="label">Original Interest</div>
            <div className="value">{result.originalInterest}</div>
          </div>
          <div className="stat-card">
            <div className="label">New Total Interest</div>
            <div className="value">{result.newTotalInterest}</div>
          </div>
          <div className="stat-card">
            <div className="label">New Monthly PITI</div>
            <div className="value">{result.newTotalMonthly}</div>
          </div>
        </div>

        <div
          className="chart-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            textAlign: 'center',
            gap: '15px',
          }}
        >
          <div
            className="savings-message"
            style={{
              fontSize: '1.1rem',
              lineHeight: 1.5,
              color: result.savingsColor,
            }}
            {...(result.savingsIsHtml
              ? { dangerouslySetInnerHTML: { __html: result.savingsMessage } }
              : { children: result.savingsMessage })}
          ></div>
          <i className="fas fa-piggy-bank"></i>
        </div>
      </aside>
    </>
  );
}
