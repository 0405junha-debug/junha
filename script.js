/**
 * 리얼 3D 화이트 공학용 계산기 & 인라인 수식 에디터 (Natural Display Style)
 * 특징:
 * 1. 카시오 공학용 계산기 스타일 수식 표시 및 인라인 커서 탐색/중간 수정 기능
 * 2. 완전한 Shunting-yard 기반 공학 수학 수식 파서 (괄호 우선순위, 중첩 연산, 팩토리얼, 거듭제곱)
 * 3. DEG / RAD 각도 단위 모드 및 특수각 정밀도 보정
 * 4. 실시간 외환 API 환율 변환 & 계산 기록 위젯 연동
 * 5. 초고시인성 잉크 블랙 대형 폰트 & 3D 물리적 키 누름 애니메이션
 */

class ScientificNaturalCalculator {
  constructor() {
    // DOM Elements
    this.calculator = document.getElementById('calculator');
    this.expressionEditor = document.getElementById('expressionEditor');
    this.exprContent = document.getElementById('exprContent');
    this.calcCursor = document.getElementById('calcCursor');
    this.calcDisplay = document.getElementById('calcDisplay');
    this.activeOperatorBadge = document.getElementById('activeOperatorBadge');

    // 모드 탭
    this.tabStandard = document.getElementById('tabStandard');
    this.tabScientific = document.getElementById('tabScientific');
    this.tabCurrency = document.getElementById('tabCurrency');

    // 각도 모드 버튼
    this.btnAngleMode = document.getElementById('btnAngleMode');
    this.angleBadge = document.getElementById('angleBadge');
    this.keyRadSwitch = document.getElementById('key-rad-switch');

    // 2nd 키 및 라벨
    this.key2nd = document.getElementById('key-2nd');
    this.keySin = document.getElementById('key-sin');
    this.keyCos = document.getElementById('key-cos');
    this.keyTan = document.getElementById('key-tan');
    this.keyLn = document.getElementById('key-ln');
    this.keyLog = document.getElementById('key-log');

    // 환율 관련
    this.currencyBar = document.getElementById('currencyBar');
    this.rateStatusBar = document.getElementById('rateStatusBar');
    this.currencyFrom = document.getElementById('currencyFrom');
    this.currencyTo = document.getElementById('currencyTo');
    this.btnSwapCurrency = document.getElementById('btnSwapCurrency');
    this.rateSummaryText = document.getElementById('rateSummaryText');
    this.btnRefreshRate = document.getElementById('btnRefreshRate');

    // 계산 기록 위젯
    this.btnHistoryToggle = document.getElementById('btnHistoryToggle');
    this.historyDrawer = document.getElementById('historyDrawer');
    this.historyList = document.getElementById('historyList');
    this.btnClearHistory = document.getElementById('btnClearHistory');
    this.historyCountBadge = document.getElementById('historyCountBadge');

    // 상태 관리
    this.currentMode = 'standard'; // 'standard' | 'scientific' | 'currency'
    this.angleMode = 'DEG'; // 'DEG' | 'RAD'
    this.is2ndActive = false;

    // 수식 및 커서 인덱스 (핵심!)
    this.expression = '';
    this.cursorIndex = 0;
    this.lastResult = '0';
    this.isEvaluated = false;
    this.history = [];

    // 환율 상태
    this.ratesData = null;
    this.lastUpdatedTime = null;
    this.isLoadingRate = false;

    this.currencySymbols = {
      USD: '$',
      KRW: '₩',
      JPY: '¥',
      EUR: '€',
      CNY: '¥',
      GBP: '£',
      VND: '₫',
      AUD: 'A$'
    };

    this.fallbackRates = {
      USD: 1,
      KRW: 1360.5,
      JPY: 153.2,
      EUR: 0.92,
      CNY: 7.24,
      GBP: 0.78,
      VND: 25400,
      AUD: 1.52
    };

    this.init();
  }

  async init() {
    this.bindEvents();
    this.renderEditor();
    this.updateDisplayResult('0');
    this.renderHistory();
    await this.fetchLiveRates();
  }

  bindEvents() {
    // 키패드 클릭
    document.querySelectorAll('.key').forEach(button => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.handleKeyTrigger(button);
      });
    });

    // 키보드 입력
    window.addEventListener('keydown', (e) => {
      this.handleKeyboard(e);
    });

    // 수식 에디터 클릭 시 커서 위치 지정
    this.expressionEditor.addEventListener('click', (e) => {
      this.handleEditorClick(e);
    });

    // 모드 탭
    this.tabStandard.addEventListener('click', () => this.switchMode('standard'));
    this.tabScientific.addEventListener('click', () => this.switchMode('scientific'));
    this.tabCurrency.addEventListener('click', () => this.switchMode('currency'));

    // 각도 단위 스위치
    if (this.btnAngleMode) {
      this.btnAngleMode.addEventListener('click', () => this.toggleAngleMode());
    }

    // 환율 제어
    this.currencyFrom.addEventListener('change', () => this.handleCurrencyChange());
    this.currencyTo.addEventListener('change', () => this.handleCurrencyChange());
    this.btnSwapCurrency.addEventListener('click', () => this.swapCurrencies());
    this.btnRefreshRate.addEventListener('click', () => this.fetchLiveRates(true));

    // 계산 기록 위젯 제어
    this.btnHistoryToggle.addEventListener('click', () => this.toggleHistory());
    this.btnClearHistory.addEventListener('click', () => this.clearHistory());

    // 디스플레이 클릭 복사
    this.calcDisplay.addEventListener('click', () => this.copyToClipboard());
  }

  // =========================================================================
  // 수식 및 커서 인라인 조작 엔진
  // =========================================================================

  // 커서 위치에 텍스트 삽입
  insertAtCursor(text) {
    if (this.isEvaluated) {
      // 계산 완료 후 숫자나 함수를 입력하면 새로운 수식 시작
      if (/^[0-9.]/.test(text) || text.includes('(')) {
        this.expression = '';
        this.cursorIndex = 0;
      }
      this.isEvaluated = false;
    }

    const before = this.expression.slice(0, this.cursorIndex);
    const after = this.expression.slice(this.cursorIndex);
    this.expression = before + text + after;
    this.cursorIndex += text.length;

    this.renderEditor();
    this.evaluateLivePreview();
  }

  // 커서 위치 앞의 문자 또는 함수 토큰 스마트 삭제 (DEL)
  deleteAtCursor() {
    if (this.cursorIndex <= 0) return;

    if (this.isEvaluated) {
      this.isEvaluated = false;
    }

    const before = this.expression.slice(0, this.cursorIndex);
    const after = this.expression.slice(this.cursorIndex);

    // 복합 함수 덩어리 패턴 감지 (예: sin(, cos(, ln(, sqrt( 등)
    const multiCharTokens = [
      'sin(', 'cos(', 'tan(', 'asin(', 'acos(', 'atan(',
      'ln(', 'log(', 'sqrt(', 'cbrt(', 'abs(', '^(2)', '^(-1)'
    ];

    let deletedLength = 1;
    for (const token of multiCharTokens) {
      if (before.endsWith(token)) {
        deletedLength = token.length;
        break;
      }
    }

    this.expression = before.slice(0, -deletedLength) + after;
    this.cursorIndex -= deletedLength;

    this.renderEditor();
    this.evaluateLivePreview();
  }

  // 커서 좌/우 이동
  moveCursorLeft() {
    if (this.cursorIndex > 0) {
      this.cursorIndex--;
      this.renderEditor();
    }
  }

  moveCursorRight() {
    if (this.cursorIndex < this.expression.length) {
      this.cursorIndex++;
      this.renderEditor();
    }
  }

  // 수식 전체 초기화 (AC)
  clear() {
    this.expression = '';
    this.cursorIndex = 0;
    this.isEvaluated = false;
    this.renderEditor();
    this.updateDisplayResult('0');
    this.activeOperatorBadge.textContent = '';
  }

  // 부호 반전 (±)
  toggleSign() {
    if (this.expression.length === 0) {
      this.insertAtCursor('-');
      return;
    }
    // 현재 커서 앞의 숫자 덩어리 탐색 후 부호 반전
    this.insertAtCursor('×(-1)');
  }

  // 수식 화면 렌더링 (글자별 스팬 + 깜빡이는 커서 배치)
  renderEditor() {
    if (this.currentMode === 'currency') {
      // 환율 모드일 때는 심플 포맷
      this.exprContent.innerHTML = `<span class="expr-char">${this.expression || '0'} ${this.currencyFrom.value} =</span>`;
      this.calcCursor.style.display = 'none';
      return;
    }

    this.calcCursor.style.display = 'inline-block';

    if (this.expression.length === 0) {
      this.exprContent.innerHTML = '';
      this.calcCursor.className = 'calc-cursor';
      return;
    }

    // 각 글자를 개별 스팬으로 분리하여 클릭 위치를 정밀하게 파악
    let html = '';
    for (let i = 0; i < this.expression.length; i++) {
      if (i === this.cursorIndex) {
        html += '<span class="calc-cursor"></span>';
      }
      const char = this.expression[i];
      html += `<span class="expr-char" data-index="${i}">${this.escapeHtml(char)}</span>`;
    }

    if (this.cursorIndex >= this.expression.length) {
      html += '<span class="calc-cursor"></span>';
    }

    this.exprContent.innerHTML = html;
  }

  // 마우스 클릭 시 커서 위치 지정
  handleEditorClick(e) {
    const target = e.target;
    if (target.classList.contains('expr-char')) {
      const idx = parseInt(target.dataset.index, 10);
      const rect = target.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      // 글자의 절반 이상을 클릭했으면 그 다음 인덱스로 이동
      this.cursorIndex = clickX > rect.width / 2 ? idx + 1 : idx;
      this.renderEditor();
    } else {
      // 빈 여백을 클릭하면 끝으로 이동
      this.cursorIndex = this.expression.length;
      this.renderEditor();
    }
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // =========================================================================
  // 완전한 공학용 수식 파서 (Shunting-yard Algorithm & Evaluation)
  // =========================================================================

  // 입력 도중 실시간 미리보기 결과 계산
  evaluateLivePreview() {
    if (this.expression.trim().length === 0) {
      this.updateDisplayResult('0');
      return;
    }

    try {
      const result = this.parseAndEvaluate(this.expression, false);
      if (result !== null && !isNaN(result) && isFinite(result)) {
        this.updateDisplayResult(this.formatNumber(result));
      }
    } catch {
      // 입력 중 불완전한 수식은 무시
    }
  }

  // 최종 계산 실행 (=)
  compute() {
    if (this.expression.trim().length === 0) return;

    try {
      const result = this.parseAndEvaluate(this.expression, true);
      if (result === null || isNaN(result)) {
        this.updateDisplayResult('Error');
        return;
      }

      const formatted = this.formatNumber(result);
      this.updateDisplayResult(formatted);

      // 계산 기록에 저장
      this.addHistory(this.expression, formatted, this.currentMode);

      this.isEvaluated = true;
      this.lastResult = result.toString();
    } catch (err) {
      this.updateDisplayResult('Error');
    }
  }

  // 수식 파싱 및 계산
  parseAndEvaluate(expr, isFinal = false) {
    if (!expr || expr.trim() === '') return 0;

    // 1. 수식 정규화
    let clean = expr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, `(${Math.PI})`)
      .replace(/\be\b/g, `(${Math.E})`)
      .replace(/√\(/g, 'sqrt(')
      .replace(/³√\(/g, 'cbrt(');

    // 2. 괄호 개수 보정 (닫히지 않은 괄호 자동 닫기)
    let openParens = (clean.match(/\(/g) || []).length;
    let closeParens = (clean.match(/\)/g) || []).length;
    while (openParens > closeParens) {
      clean += ')';
      closeParens++;
    }

    // 3. 토크나이저 (정규식 분할)
    const tokenRegex = /\d+(\.\d+)?|[a-zA-Z]+|\+|\-|\*|\/|\^|\!|\%|\(|\)/g;
    const rawTokens = clean.match(tokenRegex);
    if (!rawTokens) return null;

    // 4. 단항 마이너스 및 암시적 곱셈 보정
    const tokens = [];
    for (let i = 0; i < rawTokens.length; i++) {
      const prev = tokens[tokens.length - 1];
      const curr = rawTokens[i];

      // 암시적 곱셈: 2(3) -> 2*(3), (2)(3) -> (2)*(3), 2sin(30) -> 2*sin(30)
      if (prev && (
        (!isNaN(prev) && curr === '(') ||
        (prev === ')' && !isNaN(curr)) ||
        (prev === ')' && curr === '(') ||
        (!isNaN(prev) && /^(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|abs)$/.test(curr)) ||
        (prev === ')' && /^(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|abs)$/.test(curr))
      )) {
        tokens.push('*');
      }

      // 단항 마이너스: 시작 부분의 '-' 또는 연산자 바로 뒤의 '-'
      if (curr === '-' && (!prev || prev === '(' || ['+', '-', '*', '/', '^'].includes(prev))) {
        tokens.push('NEG');
      } else {
        tokens.push(curr);
      }
    }

    // 5. Shunting-yard 알고리즘 (중위 표기식 -> RPN)
    const outputQueue = [];
    const opStack = [];

    const precedence = {
      '+': 2, '-': 2,
      '*': 3, '/': 3, '%': 3,
      '^': 4,
      'NEG': 5,
      '!': 6
    };

    const isRightAssociative = op => op === '^' || op === 'NEG';
    const isFunction = t => /^(sin|cos|tan|asin|acos|atan|ln|log|sqrt|cbrt|abs)$/.test(t);

    for (const token of tokens) {
      if (!isNaN(token)) {
        outputQueue.push(parseFloat(token));
      } else if (isFunction(token)) {
        opStack.push(token);
      } else if (token === '!') {
        // 후위 팩토리얼
        outputQueue.push('!');
      } else if (token in precedence) {
        while (
          opStack.length > 0 &&
          opStack[opStack.length - 1] !== '(' &&
          (
            precedence[opStack[opStack.length - 1]] > precedence[token] ||
            (precedence[opStack[opStack.length - 1]] === precedence[token] && !isRightAssociative(token))
          )
        ) {
          outputQueue.push(opStack.pop());
        }
        opStack.push(token);
      } else if (token === '(') {
        opStack.push(token);
      } else if (token === ')') {
        while (opStack.length > 0 && opStack[opStack.length - 1] !== '(') {
          outputQueue.push(opStack.pop());
        }
        opStack.pop(); // '(' 제거

        if (opStack.length > 0 && isFunction(opStack[opStack.length - 1])) {
          outputQueue.push(opStack.pop());
        }
      }
    }

    while (opStack.length > 0) {
      const top = opStack.pop();
      if (top !== '(') outputQueue.push(top);
    }

    // 6. RPN 평가
    const evalStack = [];
    for (const token of outputQueue) {
      if (typeof token === 'number') {
        evalStack.push(token);
      } else if (token === 'NEG') {
        const val = evalStack.pop();
        evalStack.push(-val);
      } else if (token === '!') {
        const val = evalStack.pop();
        evalStack.push(this.calcFactorial(val));
      } else if (isFunction(token)) {
        const val = evalStack.pop();
        evalStack.push(this.evalMathFunction(token, val));
      } else {
        // 이항 연산자
        const b = evalStack.pop();
        const a = evalStack.pop();
        switch (token) {
          case '+': evalStack.push(a + b); break;
          case '-': evalStack.push(a - b); break;
          case '*': evalStack.push(a * b); break;
          case '/':
            if (b === 0) throw new Error('Division by zero');
            evalStack.push(a / b);
            break;
          case '%': evalStack.push(a % b); break;
          case '^': evalStack.push(Math.pow(a, b)); break;
        }
      }
    }

    return evalStack.length > 0 ? evalStack[0] : 0;
  }

  // 공학 함수 개별 연산 및 DEG/RAD 처리
  evalMathFunction(func, x) {
    let result;
    switch (func) {
      case 'sin': {
        const rad = this.angleMode === 'DEG' ? (x * Math.PI) / 180 : x;
        result = Math.sin(rad);
        if (this.angleMode === 'DEG' && x % 180 === 0) result = 0;
        if (this.angleMode === 'DEG' && (x - 30) % 360 === 0) result = 0.5;
        break;
      }
      case 'cos': {
        const rad = this.angleMode === 'DEG' ? (x * Math.PI) / 180 : x;
        result = Math.cos(rad);
        if (this.angleMode === 'DEG' && (x - 90) % 180 === 0) result = 0;
        if (this.angleMode === 'DEG' && (x - 60) % 360 === 0) result = 0.5;
        break;
      }
      case 'tan': {
        if (this.angleMode === 'DEG' && (x - 90) % 180 === 0) throw new Error('Undefined');
        const rad = this.angleMode === 'DEG' ? (x * Math.PI) / 180 : x;
        result = Math.tan(rad);
        if (this.angleMode === 'DEG' && x % 180 === 0) result = 0;
        if (this.angleMode === 'DEG' && (x - 45) % 180 === 0) result = 1;
        break;
      }
      case 'asin': {
        if (x < -1 || x > 1) throw new Error('Invalid Domain');
        const rad = Math.asin(x);
        result = this.angleMode === 'DEG' ? (rad * 180) / Math.PI : rad;
        break;
      }
      case 'acos': {
        if (x < -1 || x > 1) throw new Error('Invalid Domain');
        const rad = Math.acos(x);
        result = this.angleMode === 'DEG' ? (rad * 180) / Math.PI : rad;
        break;
      }
      case 'atan': {
        const rad = Math.atan(x);
        result = this.angleMode === 'DEG' ? (rad * 180) / Math.PI : rad;
        break;
      }
      case 'ln':
        if (x <= 0) throw new Error('Invalid Domain');
        result = Math.log(x);
        break;
      case 'log':
        if (x <= 0) throw new Error('Invalid Domain');
        result = Math.log10(x);
        break;
      case 'sqrt':
        if (x < 0) throw new Error('Invalid Domain');
        result = Math.sqrt(x);
        break;
      case 'cbrt':
        result = Math.cbrt(x);
        break;
      case 'abs':
        result = Math.abs(x);
        break;
      default:
        result = x;
    }
    return result;
  }

  calcFactorial(n) {
    if (n < 0 || !Number.isInteger(n) || n > 170) throw new Error('Invalid Factorial');
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  formatNumber(val) {
    if (val === 'Error') return 'Error';
    // 부동소수점 오차 정밀 보정
    const num = Math.round((val + Number.EPSILON) * 1e10) / 1e10;
    if (Math.abs(num) >= 1e14 || (Math.abs(num) < 1e-6 && num !== 0)) {
      return num.toExponential(6);
    }
    const parts = num.toString().split('.');
    const intPart = parseFloat(parts[0]).toLocaleString('en-US');
    return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
  }

  updateDisplayResult(text) {
    this.calcDisplay.textContent = text;
    const len = text.length;
    this.calcDisplay.classList.remove('digits-medium', 'digits-long', 'digits-overflow');
    if (len > 14) this.calcDisplay.classList.add('digits-overflow');
    else if (len > 10) this.calcDisplay.classList.add('digits-long');
    else if (len > 7) this.calcDisplay.classList.add('digits-medium');
  }

  // =========================================================================
  // 키패드 액션 라우팅
  // =========================================================================

  handleKeyTrigger(button) {
    const action = button.dataset.action;
    const num = button.dataset.num;
    const op = button.dataset.op;
    const func = button.dataset.func;
    const val = button.dataset.val;

    this.animateKeyPress(button);

    switch (action) {
      case 'number':
        this.insertAtCursor(num);
        break;
      case 'decimal':
        this.insertAtCursor('.');
        break;
      case 'operator':
        this.insertAtCursor(op);
        break;
      case 'insert':
        this.insertAtCursor(val);
        break;
      case 'cursor-left':
        this.moveCursorLeft();
        break;
      case 'cursor-right':
        this.moveCursorRight();
        break;
      case 'calculate':
        if (this.currentMode === 'currency') {
          this.recordCurrencyConversion();
        } else {
          this.compute();
        }
        break;
      case 'clear':
        this.clear();
        break;
      case 'backspace':
        this.deleteAtCursor();
        break;
      case 'toggle-sign':
        this.toggleSign();
        break;
      case 'sci-func':
        this.handleSciKey(func);
        break;
      case 'toggle-angle':
        this.toggleAngleMode();
        break;
      default:
        break;
    }
  }

  // 공학 키 입력 처리 (수식에 삽입)
  handleSciKey(func) {
    if (func === '2nd') {
      this.toggle2ndMode();
      return;
    }

    switch (func) {
      case 'sin':
        this.insertAtCursor(this.is2ndActive ? 'asin(' : 'sin(');
        break;
      case 'cos':
        this.insertAtCursor(this.is2ndActive ? 'acos(' : 'cos(');
        break;
      case 'tan':
        this.insertAtCursor(this.is2ndActive ? 'atan(' : 'tan(');
        break;
      case 'ln':
        this.insertAtCursor(this.is2ndActive ? 'e^(' : 'ln(');
        break;
      case 'log':
        this.insertAtCursor(this.is2ndActive ? '10^(' : 'log(');
        break;
      case 'sqr':
        this.insertAtCursor('^(2)');
        break;
      case 'pow':
        this.insertAtCursor('^');
        break;
      case 'sqrt':
        this.insertAtCursor('√(');
        break;
      case 'cbrt':
        this.insertAtCursor('³√(');
        break;
      case 'reciprocal':
        this.insertAtCursor('^(-1)');
        break;
      case 'abs':
        this.insertAtCursor('abs(');
        break;
      case 'factorial':
        this.insertAtCursor('!');
        break;
      default:
        break;
    }
  }

  // 각도 단위 토글 (DEG ↔ RAD)
  toggleAngleMode() {
    this.angleMode = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
    if (this.angleBadge) {
      this.angleBadge.textContent = this.angleMode;
    }
    if (this.keyRadSwitch) {
      this.keyRadSwitch.querySelector('.key-surface').textContent = this.angleMode === 'DEG' ? 'RAD' : 'DEG';
    }
    this.evaluateLivePreview();
  }

  // 2nd 키 토글
  toggle2ndMode() {
    this.is2ndActive = !this.is2ndActive;
    this.key2nd.classList.toggle('active-2nd', this.is2ndActive);

    if (this.is2ndActive) {
      this.keySin.querySelector('.key-surface').innerHTML = 'sin<sup>-1</sup>';
      this.keyCos.querySelector('.key-surface').innerHTML = 'cos<sup>-1</sup>';
      this.keyTan.querySelector('.key-surface').innerHTML = 'tan<sup>-1</sup>';
      this.keyLn.querySelector('.key-surface').innerHTML = 'e<sup>x</sup>';
      this.keyLog.querySelector('.key-surface').innerHTML = '10<sup>x</sup>';
    } else {
      this.keySin.querySelector('.key-surface').innerHTML = 'sin';
      this.keyCos.querySelector('.key-surface').innerHTML = 'cos';
      this.keyTan.querySelector('.key-surface').innerHTML = 'tan';
      this.keyLn.querySelector('.key-surface').innerHTML = 'ln';
      this.keyLog.querySelector('.key-surface').innerHTML = 'log';
    }
  }

  // 키보드 인터랙션
  handleKeyboard(e) {
    if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;

    if (e.key === 'Tab') {
      e.preventDefault();
      if (this.currentMode === 'standard') this.switchMode('scientific');
      else if (this.currentMode === 'scientific') this.switchMode('currency');
      else this.switchMode('standard');
      return;
    }
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      this.toggleHistory();
      return;
    }

    // 커서 이동
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.moveCursorLeft();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.moveCursorRight();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      this.cursorIndex = 0;
      this.renderEditor();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      this.cursorIndex = this.expression.length;
      this.renderEditor();
      return;
    }

    if (e.key === 'Backspace') {
      e.preventDefault();
      this.deleteAtCursor();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.clear();
      return;
    }
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      this.compute();
      return;
    }

    // 숫자 및 연산자 입력
    if (!isNaN(e.key) && e.key !== ' ') {
      this.insertAtCursor(e.key);
    } else if (e.key === '.') {
      this.insertAtCursor('.');
    } else if (e.key === '+') {
      this.insertAtCursor('+');
    } else if (e.key === '-') {
      this.insertAtCursor('−');
    } else if (e.key === '*' || e.key === 'x' || e.key === 'X') {
      this.insertAtCursor('×');
    } else if (e.key === '/') {
      e.preventDefault();
      this.insertAtCursor('÷');
    } else if (e.key === '^') {
      this.insertAtCursor('^');
    } else if (e.key === '(') {
      this.insertAtCursor('(');
    } else if (e.key === ')') {
      this.insertAtCursor(')');
    } else if (e.key === '!') {
      this.insertAtCursor('!');
    } else if (e.key === '%') {
      this.insertAtCursor('%');
    }
  }

  animateKeyPress(button) {
    button.classList.add('pressed');
    setTimeout(() => {
      button.classList.remove('pressed');
    }, 110);
  }

  // =========================================================================
  // 모드 전환 & 환율 & 히스토리
  // =========================================================================

  switchMode(mode) {
    if (this.currentMode === mode) return;
    this.currentMode = mode;

    [this.tabStandard, this.tabScientific, this.tabCurrency].forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });

    this.currencyBar.classList.remove('active');
    this.rateStatusBar.classList.remove('active');
    this.calculator.classList.remove('scientific-mode');

    if (mode === 'standard') {
      this.tabStandard.classList.add('active');
      this.tabStandard.setAttribute('aria-selected', 'true');
    } else if (mode === 'scientific') {
      this.tabScientific.classList.add('active');
      this.tabScientific.setAttribute('aria-selected', 'true');
      this.calculator.classList.add('scientific-mode');
    } else if (mode === 'currency') {
      this.tabCurrency.classList.add('active');
      this.tabCurrency.setAttribute('aria-selected', 'true');
      this.currencyBar.classList.add('active');
      this.rateStatusBar.classList.add('active');
    }

    this.renderEditor();
    if (mode === 'currency') {
      this.updateCurrencyDisplay();
    } else {
      this.evaluateLivePreview();
    }
  }

  toggleHistory() {
    const isOpen = this.historyDrawer.classList.toggle('open');
    this.btnHistoryToggle.classList.toggle('active', isOpen);
  }

  // 실시간 환율
  async fetchLiveRates(isManual = false) {
    if (this.isLoadingRate) return;
    this.isLoadingRate = true;
    if (isManual) this.btnRefreshRate.classList.add('spinning');

    this.rateSummaryText.textContent = '실시간 환율 갱신 중...';

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-cache' });
      if (!res.ok) throw new Error('환율 서버 오류');
      const data = await res.json();
      if (data && data.rates) {
        this.ratesData = data.rates;
        const now = new Date();
        this.lastUpdatedTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      }
    } catch {
      if (!this.ratesData) {
        this.ratesData = this.fallbackRates;
        this.lastUpdatedTime = '기본 기준';
      }
    } finally {
      this.isLoadingRate = false;
      this.btnRefreshRate.classList.remove('spinning');
      this.updateRateStatusBar();
      if (this.currentMode === 'currency') {
        this.updateCurrencyDisplay();
      }
    }
  }

  updateRateStatusBar() {
    const from = this.currencyFrom.value;
    const to = this.currencyTo.value;
    const rates = this.ratesData || this.fallbackRates;
    const rate = (rates[to] || 1) / (rates[from] || 1);
    const formatted = rate >= 100 ? rate.toLocaleString('en-US', { maximumFractionDigits: 2 }) : rate.toFixed(4);
    this.rateSummaryText.textContent = `1 ${from} = ${formatted} ${to} (${this.lastUpdatedTime} 실시간)`;
  }

  handleCurrencyChange() {
    this.updateRateStatusBar();
    this.updateCurrencyDisplay();
  }

  swapCurrencies() {
    const temp = this.currencyFrom.value;
    this.currencyFrom.value = this.currencyTo.value;
    this.currencyTo.value = temp;
    this.btnSwapCurrency.style.transform = 'rotate(180deg)';
    setTimeout(() => { this.btnSwapCurrency.style.transform = ''; }, 200);
    this.handleCurrencyChange();
  }

  updateCurrencyDisplay() {
    const from = this.currencyFrom.value;
    const to = this.currencyTo.value;
    const rates = this.ratesData || this.fallbackRates;
    const rate = (rates[to] || 1) / (rates[from] || 1);
    const inputVal = parseFloat(this.expression) || 0;
    const converted = inputVal * rate;

    let res;
    if (to === 'KRW' || to === 'JPY' || to === 'VND') {
      res = Math.round(converted).toLocaleString('en-US');
    } else {
      res = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    this.exprContent.innerHTML = `<span class="expr-char">${this.expression || '0'} ${from} =</span>`;
    this.activeOperatorBadge.textContent = this.currencySymbols[to] || '';
    this.updateDisplayResult(res);
  }

  recordCurrencyConversion() {
    const from = this.currencyFrom.value;
    const to = this.currencyTo.value;
    const rates = this.ratesData || this.fallbackRates;
    const rate = (rates[to] || 1) / (rates[from] || 1);
    const inputVal = parseFloat(this.expression) || 0;
    const converted = inputVal * rate;

    let res;
    if (to === 'KRW' || to === 'JPY' || to === 'VND') {
      res = Math.round(converted).toLocaleString('en-US');
    } else {
      res = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    this.addHistory(`${this.expression || '0'} ${from} →`, `${this.currencySymbols[to] || ''} ${res} ${to}`, 'currency', res);
    this.isEvaluated = true;
  }

  addHistory(formula, result, type = 'standard', rawValue = null) {
    this.history.unshift({
      formula,
      result,
      type,
      rawValue: rawValue || result,
      timestamp: new Date()
    });
    if (this.history.length > 25) this.history.pop();
    this.renderHistory();
  }

  renderHistory() {
    this.historyCountBadge.textContent = this.history.length;
    if (this.history.length === 0) {
      this.historyList.innerHTML = '<div class="history-empty">계산 기록이 없습니다.</div>';
      return;
    }

    this.historyList.innerHTML = '';
    this.history.forEach(item => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'button');
      el.setAttribute('title', '클릭 시 이 결과를 현재 수식에 불러옵니다');

      const isCurr = item.type === 'currency';
      el.innerHTML = `
        <div class="history-item-formula">${item.formula} ${isCurr ? '' : '='}</div>
        <div class="history-item-result">${item.result}</div>
      `;

      el.addEventListener('click', () => {
        const clean = item.rawValue.replace(/[^0-9.-]/g, '');
        if (clean) {
          this.insertAtCursor(clean);
        }
      });

      this.historyList.appendChild(el);
    });
  }

  clearHistory() {
    this.history = [];
    this.renderHistory();
  }

  copyToClipboard() {
    const text = this.calcDisplay.textContent.replace(/,/g, '');
    navigator.clipboard.writeText(text).then(() => {
      const orig = this.calcDisplay.textContent;
      this.calcDisplay.textContent = 'COPIED!';
      setTimeout(() => { this.calcDisplay.textContent = orig; }, 700);
    }).catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.sciCalc = new ScientificNaturalCalculator();
});
