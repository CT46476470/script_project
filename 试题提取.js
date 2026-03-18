// ==UserScript==
// @name         试题截图器 + 自动上传 (去重自动导出版)
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  支持导入已完成ID表格自动跳过，批量获取题目、截图并直接上传到图床，完成自动导出
// @author       You
// @match        *://zujuan.xkw.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 1. 上传配置 =====================
    const UPLOAD_CONFIG = {
        url: "https://vmzuhzwrsucrdgcbjywy.supabase.co/functions/v1/upload-to-catbox",
        method: "POST"
    };

    // ---------- 全局变量 ----------
    let exportData = [];
    let isProcessing = false;
    let referenceWidth = null;
    let completedIds = new Set(); // 存储已完成的题目ID

    // ===================== 2. 上传工具函数 =====================

    // DataURL 转 File 对象
    async function dataUrlToFile(dataUrl, fileName = `dataurl_${Date.now()}.png`) {
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        return new File([blob], fileName, { type: blob.type });
    }

    // 统一上传函数
    function uploadImage(file) {
        return new Promise((resolve) => {
            const formData = new FormData();
            formData.append('file', file);
            GM_xmlhttpRequest({
                method: UPLOAD_CONFIG.method,
                url: UPLOAD_CONFIG.url,
                data: formData,
                timeout: 30000,
                onload: (res) => {
                    try {
                        const result = JSON.parse(res.responseText);
                        if (res.status === 200 && result.url) {
                            resolve({ success: true, url: result.url });
                        } else {
                            resolve({ success: false, msg: result.msg || '接口异常' });
                        }
                    } catch (err) {
                        resolve({ success: false, msg: '解析响应失败' });
                    }
                },
                onerror: () => resolve({ success: false, msg: '网络错误' }),
                ontimeout: () => resolve({ success: false, msg: '上传超时' })
            });
        });
    }

    // ---------- 【新增】CSV解析与ID导入 ----------
    function parseCsvForIds(text) {
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length === 0) return;

        const ids = new Set();
        let idIndex = 0; // 默认第一列是ID

        // 简单的CSV解析逻辑
        const firstRow = lines[0].split(',').map(cell => cell.replace(/"/g, '').trim());

        // 检查是否有表头“题目ID”
        if (firstRow.includes('题目ID')) {
            idIndex = firstRow.indexOf('题目ID');
            lines.shift(); // 移除表头
        }

        lines.forEach(line => {
            // 简单处理，按逗号分割，去除引号
            const cells = line.split(',').map(cell => cell.replace(/"/g, '').trim());
            if (cells[idIndex]) {
                ids.add(cells[idIndex]);
            }
        });

        completedIds = ids;
        console.log(`✅ 成功导入 ${ids.size} 个已完成ID`);
        alert(`成功导入 ${ids.size} 个已完成ID，将自动跳过`);
    }

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                parseCsvForIds(e.target.result);
            } catch (err) {
                console.error('解析CSV失败', err);
                alert('解析CSV文件失败，请确保格式正确');
            }
        };
        reader.readAsText(file);
    }

    // ---------- 从URL自动解析参数 ----------
    function parseParamsFromUrl() {
        const url = window.location.href;
        const params = {
            pageName: "zsd",
            bankId: "11",
            courseId: "0",
            categoryId: "27925",
            quesType: "2701",
            paperTypeId: "9",
            curPage: "2"
        };

        const zsdMatch = url.match(/zsd(\d+)/);
        if (zsdMatch) params.categoryId = zsdMatch[1];
        const qtMatch = url.match(/qt(\d+)/);
        if (qtMatch) params.quesType = qtMatch[1];
        const ptMatch = url.match(/pt(\d+)/);
        if (ptMatch) params.paperTypeId = ptMatch[1];
        const pMatch = url.match(/p(\d+)/);
        if (pMatch) params.curPage = pMatch[1];

        console.log("✅ 从URL解析出参数：", params);
        return params;
    }

    // ---------- 获取参考宽度 ----------
    function getReferenceWidth() {
        if (referenceWidth !== null) return referenceWidth;
        const sample = document.querySelector('.tk-quest-item.quesroot');
        referenceWidth = sample ? sample.offsetWidth : 800;
        return referenceWidth;
    }

    // ---------- 创建悬浮控制面板 ----------
    const panel = document.createElement('div');
    panel.style.cssText = `
        position: fixed;top: 10px;right: 10px;z-index: 9999;
        background: white;padding: 15px;border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        display: flex;flex-direction: column;gap: 12px;
        font-size: 13px;max-width: 280px;
    `;

    // 【新增】导入区域
    const importSection = document.createElement('div');
    importSection.style.cssText = `border-bottom: 1px solid #ccc;padding-bottom: 10px;display: flex;flex-direction: column;gap: 8px;`;
    const importTitle = document.createElement('div');
    importTitle.textContent = '📂 导入已完成ID (可选)';
    importTitle.style.fontWeight = 'bold';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.cssText = 'font-size: 12px;';
    fileInput.addEventListener('change', handleFileUpload);

    importSection.append(importTitle, fileInput);

    const btnDom = document.createElement('button');
    btnDom.textContent = '📸 截图当前页面(直传)';
    btnDom.style.cssText = `padding: 8px;background: #4CAF50;color: white;border: none;border-radius: 4px;cursor: pointer;font-weight: bold;`;
    btnDom.addEventListener('click', captureDomElements);

    const apiSection = document.createElement('div');
    apiSection.style.cssText = `border-top: 1px solid #ccc;padding-top: 10px;display: flex;flex-direction: column;gap: 8px;`;
    const apiTitle = document.createElement('div');
    apiTitle.textContent = '🔌 API 批量提取 (直传版)';
    apiTitle.style.fontWeight = 'bold';

    const limitRow = document.createElement('div');
    limitRow.style.display = 'flex';
    limitRow.style.alignItems = 'center';
    limitRow.style.gap = '5px';
    limitRow.innerHTML = `<span style="white-space: nowrap;">提取数量:</span><input type="number" id="apiLimit" min="1" placeholder="留空=全部" style="width:100px; padding:4px;">`;

    const btnApi = document.createElement('button');
    btnApi.textContent = '📥 开始(截图+上传)';
    btnApi.style.cssText = `padding: 8px;background: #2196F3;color: white;border: none;border-radius: 4px;cursor: pointer;font-weight: bold;`;

    const progressDiv = document.createElement('div');
    progressDiv.style.cssText = `font-size: 12px;color: #333;background: #f5f5f5;padding: 4px 8px;border-radius: 4px;display: none;`;
    progressDiv.id = 'apiProgress';

    const btnExportNow = document.createElement('button');
    btnExportNow.textContent = '📋 立即导出CSV';
    btnExportNow.style.cssText = `padding: 6px;background: #FF9800;color: white;border: none;border-radius: 4px;cursor: pointer;font-size: 12px;`;
    btnExportNow.disabled = true;
    btnExportNow.addEventListener('click', () => {
        exportData.length ? exportToCSV(exportData) : alert('暂无已处理的数据');
    });

    apiSection.append(apiTitle, limitRow, btnApi, progressDiv, btnExportNow);
    panel.append(importSection, btnDom, apiSection);
    document.body.appendChild(panel);

    // ---------- 工具函数：提取题目信息 ----------
    function extractQuestionInfo(container, index) {
        const info = {id: container.getAttribute('questionid') || (index + 1)};
        const typeSpan = container.querySelector('.addi-info .info-cnt');
        info.type = typeSpan ? typeSpan.innerText.trim() : '';
        const difficultySpans = container.querySelectorAll('.addi-info .info-cnt');
        info.difficulty = difficultySpans.length > 1 ? difficultySpans[1].innerText.trim() : '';
        info.knowledge = Array.from(container.querySelectorAll('.knowledge-item')).map(k => k.innerText.trim()).join('；');
        const contentDiv = container.querySelector('.exam-item__cnt');
        info.content = contentDiv ? contentDiv.innerText.trim().replace(/\s+/g, ' ') : '';
        const srcLink = container.querySelector('.ques-src');
        info.source = srcLink ? srcLink.innerText.trim() : '';
        info.screenshotUrl = '';
        return info;
    }

    // ---------- 工具函数：内联图片 ----------
    function inlineImage(img) {
        return new Promise((resolve, reject) => {
            const src = img.src;
            if (!src || src.startsWith('data:')) { resolve(); return; }
            GM_xmlhttpRequest({
                method: 'GET',url: src,responseType: 'blob',
                headers: {'Referer': location.origin,'User-Agent': navigator.userAgent},
                onload: response => {
                    if (response.status >= 200 && response.status < 300) {
                        const reader = new FileReader();
                        reader.onload = e => {img.src = e.target.result; img.onload = resolve;};
                        reader.readAsDataURL(response.response);
                    } else reject();
                },
                onerror: () => reject()
            });
        });
    }

    async function inlineAllImagesInContainer(container) {
        const images = Array.from(container.querySelectorAll('img:not([src^="data:"])'));
        await Promise.allSettled(images.map(img => inlineImage(img)));
    }

    // ---------- 工具函数：导出CSV ----------
    function exportToCSV(data, filename = null) {
        if (!data.length) {
            console.log("没有数据可导出");
            return;
        }
        const headers = ['题目ID', '题目类型', '难度', '知识点', '题目内容', '来源', '截图链接'];
        const csvRows = data.map(item => [
            item.id, item.type, item.difficulty, item.knowledge, item.content, item.source, item.screenshotUrl
        ].map(field => {
            const str = String(field ?? '');
            return /[,"\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(','));
        const blob = new Blob(['\uFEFF' + [headers.join(','), ...csvRows].join('\n')], {type: 'text/csv;charset=utf-8;'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || `试题列表_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
        console.log("✅ CSV已自动导出");
    }

    // ---------- 核心处理函数：处理试题 (加入跳过逻辑) ----------
    async function processQuestionElements(questions, startIndex, total) {
        const refWidth = getReferenceWidth();
        let skippedCount = 0;

        for (let i = 0; i < questions.length && isProcessing; i++) {
            const container = questions[i];
            const info = extractQuestionInfo(container, startIndex + i);

            // 【新增】检查是否已完成，若是则跳过
            if (completedIds.has(String(info.id))) {
                console.log(`⏭️ 跳过已完成题目: ${info.id}`);
                skippedCount++;
                updateProgress(exportData.length, total, skippedCount);
                continue;
            }

            const wrapper = document.createElement('div');
            wrapper.style.cssText = `position:absolute;left:-9999px;top:0;width:${refWidth}px`;
            const clone = container.cloneNode(true);
            wrapper.appendChild(clone);
            document.body.appendChild(wrapper);

            await inlineAllImagesInContainer(clone);
            await new Promise(r => setTimeout(r, 300));

            try {
                const canvas = await html2canvas(clone, {scale:2, backgroundColor:'#fff', useCORS:true, allowTaint:false});
                if (canvas.width && canvas.height) {
                    const fileName = `question_${info.id}.png`;

                    const dataUrl = canvas.toDataURL('image/png');
                    const file = await dataUrlToFile(dataUrl, fileName);

                    progressDiv.innerText = `进度：${exportData.length + 1} / ${total} (正在上传 ${info.id}...)`;
                    const uploadRes = await uploadImage(file);

                    if (uploadRes.success) {
                        info.screenshotUrl = uploadRes.url;
                        exportData.push(info);
                        console.log(`✅ [${fileName}] 上传成功: ${uploadRes.url}`);
                    } else {
                        info.screenshotUrl = `上传失败: ${uploadRes.msg}`;
                        exportData.push(info); // 失败也记录
                        console.error(`❌ [${fileName}] 上传失败: ${uploadRes.msg}`);
                    }

                    updateProgress(exportData.length, total, skippedCount);
                }
            } catch (e) {
                console.error('截图失败', e);
            } finally {
                wrapper.remove();
            }
            await new Promise(r => setTimeout(r, 200));
        }
    }

    // ---------- API 请求函数 ----------
    async function fetchQuestionsFromApi(limit = null) {
        const urlParams = parseParamsFromUrl();
        const baseParams = {
            pageName: urlParams.pageName, bankId: "11", courseId: "0", categoryId: urlParams.categoryId,
            canTreeMultiple: "false", canCategoryId: "false", "categoryIds[0]": "0",
            quesType: urlParams.quesType, quesDiff: "0", quesYear: "0", paperTypeId: urlParams.paperTypeId,
            scenarioizedTypeId: "0", tagId: "0", provinceId: "-1", learngrade: "0", term: "0",
            orderBy: "2", quesAttributeId: "0", examMethodId: "0", isFresh: "0", catelogTokpointId: "0"
        };

        let curPage = parseInt(urlParams.curPage);
        let allQuestions = [];
        let totalFetched = 0;

        while (true) {
            const params = new URLSearchParams({...baseParams, curPage});
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST', url: 'https://zujuan.xkw.com/zujuan-api/question/list',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Referer': location.origin, 'X-Requested-With': 'XMLHttpRequest'
                    },
                    data: params.toString(), onload: resolve, onerror: reject
                });
            });

            if (response.status !== 200) throw new Error(`请求失败：${response.status}`);
            const json = JSON.parse(response.responseText);
            const wrapper = document.createElement('div');
            wrapper.innerHTML = json.data.html;
            const questions = Array.from(wrapper.querySelectorAll('.tk-quest-item.quesroot'));
            if (!questions.length) break;

            allQuestions.push(...questions);
            totalFetched += questions.length;
            if (limit && totalFetched >= limit) { allQuestions = allQuestions.slice(0, limit); break; }
            if (totalFetched >= json.data.total) break;
            curPage++;
        }
        return allQuestions;
    }

    // ---------- API 处理主函数 (修改为自动导出) ----------
    async function captureFromApi() {
        if (isProcessing) { alert('任务进行中'); return; }
        const limit = document.getElementById('apiLimit').value.trim();
        const numLimit = limit ? parseInt(limit) : null;
        if (numLimit && (isNaN(numLimit) || numLimit < 1)) { alert('请输入有效数字'); return; }

        exportData = [];
        isProcessing = true;
        btnApi.disabled = true;
        btnExportNow.disabled = false;
        progressDiv.style.display = 'block';

        try {
            progressDiv.innerText = '正在获取题目列表...';
            const questions = await fetchQuestionsFromApi(numLimit);
            if (!questions.length) { alert('未获取到题目'); return; }

            await processQuestionElements(questions, 0, questions.length);

            // 【修改】自动导出，不询问
            if (exportData.length) {
                progressDiv.innerText = `处理完成，正在导出 ${exportData.length} 条数据...`;
                exportToCSV(exportData);
                GM_notification({ text: `成功处理 ${exportData.length} 题，CSV已自动下载`, title: '任务完成', timeout: 3000 });
            } else {
                alert('没有新数据需要处理（全部已跳过）');
            }
        } catch (e) {
            alert('失败：' + e.message);
            console.error(e);
        } finally {
            isProcessing = false;
            btnApi.disabled = false;
            progressDiv.style.display = 'none';
        }
    }

    // ---------- 页面DOM截图 (修改为自动导出) ----------
    async function captureDomElements() {
        const containers = document.querySelectorAll('.tk-quest-item.quesroot');
        if (!containers.length) { alert('未找到试题'); return; }
        exportData = [];
        isProcessing = true;
        btnDom.disabled = true;
        progressDiv.style.display = 'block';

        await processQuestionElements(Array.from(containers), 0, containers.length);

        if (exportData.length) {
            exportToCSV(exportData);
        }

        isProcessing = false;
        btnDom.disabled = false;
        progressDiv.style.display = 'none';
    }

    // ---------- 进度更新 (加入跳过计数) ----------
    function updateProgress(current, total, skipped = 0) {
        let text = `进度：${current} / ${total}`;
        if (skipped > 0) text += ` (已跳过: ${skipped})`;
        document.getElementById('apiProgress').innerText = text;
    }

    btnApi.addEventListener('click', captureFromApi);
})();
