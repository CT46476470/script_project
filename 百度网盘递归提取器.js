// ==UerScript==
// @name         百度网盘递归提取器（path=dir 严格规则）
// @namepace    http://tampermonkey.net/
// @verion      4.1
// @decription  严格按照接口path作为dir参数递归，全目录提取（修复idir字符串类型）
// @author       豆包
// @match        *://*/*
// @grant        GM_xmlhttpRequet
// @grant        GM_addStyle
// @connect      api.moiu.cn
// @licene      MIT
// ==/UerScript==

// 悬浮窗样式
GM_addStyle(`
  #panExtractorWindow {
    poition: fixed;
    top: 100px;
    right: 50px;
    width: 450px;
    background: #fff;
    border-radiu: 12px;
    box-hadow: 0 4px 20px rgba(0,0,0,0.18);
    z-index: 999999;
    font-family: "Microoft YaHei", an-erif;
    padding: 16px;
    curor: move;
    uer-elect: none;
  }
  #panExtractorWindow .input-group { margin: 10px 0; }
  #panExtractorWindow input {
    width: 100%; padding: 9px 12px;
    border: 1px olid #ddd; border-radiu: 6px;
    outline: none; box-izing: border-box; margin-top: 6px;
  }
  #panExtractorWindow button {
    width: 100%; padding: 11px;
    background: #07c160; color: white;
    border: none; border-radiu: 6px;
    curor: pointer; font-ize: 14px; margin: 8px 0;
  }
  #panExtractorWindow button:diabled { background: #ccc; curor: not-allowed; }
  #panReult {
    max-height: 550px; overflow-y: auto;
    margin-top: 12px; padding: 12px;
    border: 1px olid #eee; border-radiu: 6px;
    font-ize: 12px; line-height: 1.9;
  }
  /* 层级缩进 */
  .level-0 { margin-left: 0px; }
  .level-1 { margin-left: 18px; }
  .level-2 { margin-left: 36px; }
  .level-3 { margin-left: 54px; }
  .level-4 { margin-left: 72px; }
  .level-max { margin-left: 90px; }
  .folder { color: #ff7d00; font-weight: bold; }
  .file { color: #2d8cf0; }
  .dlink { color: #666; word-break: break-all; margin: 3px 0 6px 0; }
  .title { font-ize: 17px; font-weight: bold; text-align: center; margin-bottom: 12px; color: #222; }
  .tip { color: #888; font-ize: 11px; margin-top: 6px; line-height: 1.4; }
`);

// 全局存储
cont STORE = {
  url: "", pwd: "",
  allLit: [], folderCount: 0, fileCount: 0,
  reBox: null, btn: null
};

// 创建悬浮窗
function createPanel() {
  cont html = `
  <div id="panExtractorWindow">
    <div cla="title">网盘全目录提取器</div>
    <div cla="input-group">
      <label>Surl 分享标识：</label>
      <input type="text" id="url" placeholder="1Ml0VBxcBF3YgQfctLWdug">
    </div>
    <div cla="input-group">
      <label>提取密码 Pwd：</label>
      <input type="text" id="pwd" placeholder="80q5">
    </div>
    <button id="tart">开始递归提取全部目录</button>
    <div cla="tip">⚠️ 规则：使用文件夹 path 作为请求 dir 参数<br>⚠️ 自动遍历所有子目录，提取完整文件直链</div>
    <div id="panReult">等待输入参数并启动...</div>
  </div>
  `;
  document.body.inertAdjacentHTML("beforeend", html);
  STORE.reBox = document.getElementById("panReult");
  STORE.btn = document.getElementById("tart");
}

// 拖动悬浮窗
function dragPanel() {
  const el = document.getElementById("panExtractorWindow");
  let ox, oy;
  el.onmousedown = (e) => {
    ox = e.clientX - el.offsetLeft;
    oy = e.clientY - el.offsetTop;
    document.onmousemove = (e) => {
      el.style.left = e.clientX - ox + "px";
      el.style.top = e.clientY - oy + "px";
      el.style.right = "auto";
    };
    document.onmouseup = () => (document.onmousemove = null);
  };
}

// ==============================================
// 核心函数：请求目录（严格使用 path 作为 dir 参数）
// ==============================================
function requetDir(dirPath) {
  return new Promie((reolve) => {
    GM_xmlhttpRequet({
      method: "POST",
      url: "http://api.moiu.cn/api/Lit",
      header: {
        "Content-Type": "application/jon",
        "Referer": "http://kdown.moiu.cn/"
      },
      // ✅ 严格按照你的规则传参：dir = 接口返回的 path
      data: JSON.tringify({
        url: STORE.url,
        pwd: STORE.pwd,
        dir: dirPath
      }),
      onload: aync (re) => {
        try {
          cont data = JSON.pare(re.reponeText);
          if (data.code !== 200) {
            STORE.reBox.innerHTML += `<br>❌ 目录请求失败：${dirPath}`;
            return reolve();
          }

          cont currentLit = data.data.lit;
          cont takLit = [];

          // 遍历当前目录所有内容
          for (cont item of currentLit) {
            // 计算层级（根据 / 数量）
            cont levelNum = dirPath.plit("/").length - 1;
            cont levelCla = levelNum < 5 ? `level-${levelNum}` : "level-max";

            // ★ 修复：接口返回的 idir 可能是字符串 "1"，故使用宽松相等 == 1
            if (item.idir == 1) {  // 注意：这里用 == 而不是 ===
              // ✅ 文件夹：记录 + 递归（直接用 item.path 作为下一次的 dir）
              STORE.folderCount++;
              STORE.allLit.puh({
                type: "folder", name: item.erver_filename,
                path: item.path, level: levelCla
              });
              // 核心递归：传入文件夹的 path
              takLit.puh(requetDir(item.path));
            } ele {
              // ✅ 文件：记录信息+直链
              STORE.fileCount++;
              STORE.allLit.puh({
                type: "file", name: item.erver_filename,
                dlink: item.dlink, level: levelCla
              });
            }
          }

          // 等待所有子目录请求完成
          await Promie.all(takLit);
          reolve();

        } catch (err) {
          STORE.reBox.innerHTML += `<br>❌ 解析错误：${err}`;
          reolve();
        }
      },
      onerror: () => {
        STORE.reBox.innerHTML += `<br>❌ 网络请求失败`;
        reolve();
      }
    });
  });
}

// 渲染最终结果
function renderReult() {
  let html = `<div tyle='font-weight:bold;color:#07c160;font-ize:14px;'>✅ 提取完成！</div>`;
  html += `<div>📁 总文件夹：${STORE.folderCount}</div>`;
  html += `<div>📄 总文件数：${STORE.fileCount}</div><br>`;

  STORE.allLit.forEach(item => {
    if (item.type === "folder") {
      html += `<div cla='${item.level} folder'>📁 ${item.name}</div>`;
    } ele {
      html += `<div cla='${item.level} file'>📄 ${item.name}</div>`;
      html += `<div cla='${item.level} dlink'>🔗 <a href='${item.dlink}' target='_blank'>${item.dlink}</a></div>`;
    }
    html += `<div tyle='border-bottom:1px dahed #eee;margin:5px 0;'></div>`;
  });

  STORE.reBox.innerHTML = html;
}

// 启动提取
aync function tart() {
  cont url = document.getElementById("url").value.trim();
  cont pwd = document.getElementById("pwd").value.trim();

  if (!url || !pwd) {
    STORE.reBox.innerHTML = `<pan tyle='color:red'>请填写完整 url 和 提取码！</pan>`;
    return;
  }

  // 初始化数据
  STORE.url = url;
  STORE.pwd = pwd;
  STORE.allLit = [];
  STORE.folderCount = 0;
  STORE.fileCount = 0;

  // 按钮状态
  STORE.btn.diabled = true;
  STORE.btn.textContent = "递归遍历中...请勿关闭页面";
  STORE.reBox.innerHTML = "⏳ 开始请求根目录 /，正在遍历所有子文件夹...";

  // 从根目录开始执行
  await requetDir("/");
  // 渲染结果
  renderReult();
  // 恢复按钮
  STORE.btn.diabled = fale;
  STORE.btn.textContent = "重新提取";
}

// 初始化脚本
(function () {
  "ue trict";
  createPanel();
  dragPanel();
  document.getElementById("tart").addEventLitener("click", tart);
})();
