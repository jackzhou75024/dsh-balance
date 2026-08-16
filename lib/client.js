window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-balance",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    let react = require("react");

    const css =
      '.dsbal_badge{box-sizing:border-box;flex:0 0 100%;width:100%;margin-top:8px;color:var(--dsw-alias-label-primary);border:none;border-radius:12px;gap:2px;padding:5px 12px 6px 6px;font-family:inherit;font-size:14px;display:flex;flex-direction:column;overflow:hidden}' +
      '.dsbal_row{display:flex;align-items:center;gap:8px;min-width:0}' +
      '.dsbal_label{flex:1;text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}' +
      '.dsbal_sub{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}' +
      '.dsbal_icon{flex:none;color:var(--dsw-alias-label-secondary);font-weight:600;display:inline-flex}' +
      '.dsbal_rail{flex:0 0 auto;width:36px;height:36px;margin:0 auto;border-radius:50%;justify-content:center;align-items:center;gap:0;padding:0}' +
      '.dsbal_topup{flex:none;height:20px;padding:0 9px;border:none;border-radius:999px;background:var(--dsw-alias-brand-primary);color:#fff;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;line-height:20px}' +
      '.dsbal_topup:hover{opacity:.9}' +
      '.hHd-Xa_footerActions{flex-wrap:wrap}';
    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="@deepseek-ai/dsh-balance/style"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@deepseek-ai/dsh-balance";
      tag.dataset.pluginCss = "@deepseek-ai/dsh-balance/style";
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    const inject = ["slots"];

    function suffix(currency) {
      return currency === 'CNY' ? '¥' : currency;
    }

    function BalanceWidget(props) {
      const wide = !!props.wide;
      const [state, setState] = react.useState({ loading: true, data: null, error: null });

      const refresh = react.useCallback(function () {
        setState(function (s) { return { loading: true, data: s.data, error: null }; });
        fetch('/deepseek-balance', { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res.ok) setState({ loading: false, data: res, error: null });
            else setState({ loading: false, data: null, error: (res && res.message) || '查询失败' });
          })
          .catch(function (err) {
            setState({ loading: false, data: null, error: String((err && err.message) || err) });
          });
      }, []);

      react.useEffect(function () { refresh(); }, [refresh]);

      react.useEffect(function () {
        const id = setInterval(refresh, 1000);
        return function () { clearInterval(id); };
      }, [refresh]);

      let label, title, spendText;
      if (state.loading && state.data === null) {
        label = '查询余额…';
        spendText = '';
        title = '正在查询 DeepSeek API 余额…';
      } else if (state.error) {
        label = '失败 ' + String(state.error).slice(0, 30);
        spendText = '';
        title = state.error;
      } else if (state.data && state.data.available === false) {
        label = '余额查询未开通';
        spendText = '';
        title = 'DeepSeek 账户未开通余额查询';
      } else if (state.data && state.data.balances && state.data.balances.length > 0) {
        const first = state.data.balances[0];
        label = 'API余额：' + first.total + ' ' + suffix(first.currency);
        const spend = state.data.todaySpend;
        spendText = '今日消费：' + (spend === undefined || spend === null ? '0.00' : Number(spend).toFixed(2)) + ' ' + suffix(first.currency);
        title = state.data.balances.map(function (x) {
          const s = suffix(x.currency);
          return x.currency + ' · 总额 ' + x.total + ' ' + s + ' · 赠送 ' + x.granted + ' · 充值 ' + x.toppedUp;
        }).join('\n');
      } else {
        label = 'API余额：—';
        spendText = '';
        title = '未获取到余额数据';
      }

      const openTopup = function () {
        fetch('/deepseek-topup', { method: 'POST' }).catch(function () {});
      };

      if (!wide) {
        return react.createElement('div', { className: 'dsbal_badge dsbal_rail', title: title },
          react.createElement('span', { className: 'dsbal_icon' }, '¥'));
      }

      return react.createElement('div', { className: 'dsbal_badge', title: title },
        react.createElement('div', { className: 'dsbal_row' },
          react.createElement('span', { className: 'dsbal_label' }, label),
          react.createElement('button', { type: 'button', className: 'dsbal_topup', onClick: openTopup }, '充值')),
        spendText
          ? react.createElement('div', { className: 'dsbal_row' },
              react.createElement('span', { className: 'dsbal_sub' }, spendText))
          : null);
    }

    function apply(ctx) {
      ctx.slots.inject('sidebar.footer.action', function () {
        return ctx.slots.register(
          { name: 'sidebar.footer.action', id: 'deepseek-balance', order: 10 },
          BalanceWidget
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
