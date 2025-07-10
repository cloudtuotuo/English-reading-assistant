let currentSelection = '';
// 全局变量存储语音列表
let cachedVoices = null;
// 原文锁定状态管理
let isLocked = false;

const CONFIG = {
    STORAGE_KEYS: {
        SETTINGS: 'settings',
        VOCABULARY: 'vocabulary',
        DRAFT: 'draft_content'
    },
    DEFAULT_SETTINGS: {
        baseUrl: '',
        apiKey: '',
        model: '',
        evalPrompt: '',
        translatePrompt: '',
        ttsVoice: '',
        ttsSpeed: ''
    },
    AUTO_SAVE: {
        INTERVAL: 30000, // 自动保存间隔（毫秒）
        EXPIRY: 24 * 60 * 60 * 1000 // 24小时（毫秒）
    }
};

// 音频管理器
const AudioManager = {
    currentAudio: null,

    async play(text, voice, rate) {
        try {
            showToast('正在准备播放...', 'success')

            // 停止当前播放的音频
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }

            const settings = StorageManager.getSettings();
            const response = await fetch('/api/tts/speak', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    voice: voice || settings.ttsVoice,
                    rate: rate || settings.ttsSpeed
                })
            });

            if (!response.ok) {
                throw new Error('TTS request failed');
            }

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
            };

            this.currentAudio = audio;
            await audio.play();
        } catch (error) {
            console.error('TTS播放失败:', error);
            showToast('音频播放失败', 'error');
        }
    }
};

// 存储管理器
const StorageManager = {
    // 存储类型枚举
    TYPE: {
        LOCAL_STORAGE: 'localStorage',
        COOKIE: 'cookie',
        SESSION: 'session',
        MEMORY: 'memory'
    },

    // 内存存储对象
    memoryStorage: new Map(),

    // 当前使用的存储类型
    currentType: 'localStorage',

    // 初始化存储管理器
    init() {
        // 检查 localStorage 是否可用
        if (this.checkLocalStorageAvailable()) {
            this.currentType = this.TYPE.LOCAL_STORAGE;
            console.log('Using LocalStorage');
        } else if (this.checkSessionStorageAvailable()) {
            this.currentType = this.TYPE.SESSION;
            console.log('Using Session storage');
        } else {
            this.currentType = this.TYPE.MEMORY;
            console.log('Using Memory storage');
        }
    },

    // 检查 localStorage 是否可用
    checkLocalStorageAvailable() {
        try {
            localStorage.setItem("test", "test");
            localStorage.removeItem("test");
            return true;
        } catch (e) {
            return false;
        }
    },

    // 检查 SessionStorage 是否可用
    checkSessionStorageAvailable() {
        try {
            sessionStorage.setItem("test", "test");
            sessionStorage.removeItem("test");
            return true;
        } catch (e) {
            return false;
        }
    },

    // 设置值
    set(key, value, days = 7) {
        try {
            const stringValue = JSON.stringify(value);

            switch (this.currentType) {
                case this.TYPE.LOCAL_STORAGE:
                    localStorage.setItem(key, stringValue);
                    const stored = localStorage.getItem(key);
                    return !!stored;

                case this.TYPE.SESSION:
                    sessionStorage.setItem(key, stringValue);
                    return true;

                case this.TYPE.MEMORY:
                    this.memoryStorage.set(key, stringValue);
                    return true;

                default:
                    return false;
            }
        } catch (error) {
            console.error('Storage.set 错误:', error);
            return false;
        }
    },

    // 获取值
    get(key) {
        try {
            let value = null;

            switch (this.currentType) {
                case this.TYPE.LOCAL_STORAGE:
                    value = localStorage.getItem(key);
                    break;

                case this.TYPE.SESSION:
                    value = sessionStorage.getItem(key);
                    break;

                case this.TYPE.MEMORY:
                    value = this.memoryStorage.get(key);
                    break;
            }

            if (value) {
                const parsed = JSON.parse(value);
                return parsed;
            }
            return null;
        } catch (error) {
            console.error('Storage.get 错误:', error);
            return null;
        }
    },

    // 删除值
    remove(key) {
        try {
            switch (this.currentType) {
                case this.TYPE.LOCAL_STORAGE:
                    localStorage.removeItem(key);
                    break;

                case this.TYPE.SESSION:
                    sessionStorage.removeItem(key);
                    break;

                case this.TYPE.MEMORY:
                    this.memoryStorage.delete(key);
                    break;
            }
            return true;
        } catch (error) {
            console.error('Storage.remove 错误:', error);
            return false;
        }
    },

    // 获取设置
    getSettings() {
        const settings = this.get(CONFIG.STORAGE_KEYS.SETTINGS);

        // 如果没有设置，返回 null
        if (!settings) {
            return null;
        }

        // 验证必要的配置字段是否存在
        const requiredFields = ['baseUrl', 'apiKey', 'model', 'ttsVoice', 'ttsSpeed'];
        const hasAllRequired = requiredFields.every(field => settings[field]);

        // 如果缺少必要字段，返回 null
        if (!hasAllRequired) {
            return null;
        }

        return settings;
    },

    // 保存设置
    saveSettings(settings) {
        // 验证必填字段
        const requiredFields = ['baseUrl', 'apiKey', 'model', 'ttsVoice', 'ttsSpeed'];
        const missingFields = requiredFields.filter(field => !settings[field]);

        if (missingFields.length > 0) {
            console.warn('缺失的必填字段:', missingFields);
            return false;
        }

        return this.set(CONFIG.STORAGE_KEYS.SETTINGS, settings);
    },

    // 获取生词本
    getVocabulary() {
        return this.get(CONFIG.STORAGE_KEYS.VOCABULARY) || [];
    },

    // 保存生词本
    saveVocabulary(vocabulary) {
        return this.set(CONFIG.STORAGE_KEYS.VOCABULARY, vocabulary);
    },
};

// 草稿管理器
const DraftManager = {
    autoSaveTimer: null,

    // 保存草稿
    saveDraft() {
        const originalText = document.getElementById('original').value;
        const translationText = document.getElementById('translation').value;

        if (originalText || translationText) {
            const draft = {
                original: originalText,
                translation: translationText,
                timestamp: new Date().getTime()
            };
            StorageManager.set(CONFIG.STORAGE_KEYS.DRAFT, draft);
        }
    },

    // 加载草稿
    loadDraft() {
        const draft = StorageManager.get(CONFIG.STORAGE_KEYS.DRAFT);
        if (draft) {
            const now = new Date().getTime();
            // 检查是否过期
            if (now - draft.timestamp <= CONFIG.AUTO_SAVE.EXPIRY) {
                document.getElementById('original').value = draft.original || '';
                document.getElementById('translation').value = draft.translation || '';
                return true;
            } else {
                // 如果过期，清除草稿
                this.clearDraft();
            }
        }
        return false;
    },

    // 清除草稿
    clearDraft() {
        if (confirm('确定要清除草稿吗？')) {
            StorageManager.remove(CONFIG.STORAGE_KEYS.DRAFT);
            document.getElementById('original').value = '';
            document.getElementById('translation').value = '';
            showToast('草稿已清除', 'success')
        }
    },

    // 开始自动保存
    startAutoSave() {
        this.autoSaveTimer = setInterval(() => {
            this.saveDraft();
        }, CONFIG.AUTO_SAVE.INTERVAL);
    },

    // 停止自动保存
    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }
};


// 打开设置弹窗
function openSettings() {
    loadTTSVoices(false);
    loadSettings();
    document.getElementById('settingsModal').style.display = 'block';
}

// 关闭设置弹窗
function closeSettings() {
    loadSettings();
    document.getElementById('settingsModal').style.display = 'none';
}

// 保存设置
function saveSettings() {
    try {
        // 获取表单数据
        const newSettings = {
            baseUrl: document.getElementById('baseUrl').value,
            apiKey: document.getElementById('apiKey').value,
            model: document.getElementById('model').value,
            evalPrompt: document.getElementById('evalPrompt').value,
            translatePrompt: document.getElementById('translatePrompt').value,
            ttsVoice: document.getElementById('ttsVoice').value,
            ttsSpeed: document.getElementById('ttsSpeed').value
        };

        if (StorageManager.saveSettings(newSettings)) {
            closeSettings();
            showToast('设置已保存', 'success');
        } else {
            showToast('设置保存失败，请检查字段', 'error');
        }
    } catch (error) {
        console.error('保存设置时发生错误:', error);
        showToast('保存设置时发生错误', 'error');
    }
}


// 加载设置
async function loadSettings() {
    try {
        // 获取设置,如果没有则加载默认配置
        let settings = StorageManager.getSettings();

        // 更新表单值
        if (settings) {
            // 基础设置
            document.getElementById('baseUrl').value = settings.baseUrl;
            document.getElementById('apiKey').value = settings.apiKey;
            document.getElementById('model').value = settings.model;
            document.getElementById('evalPrompt').value = settings.evalPrompt;
            document.getElementById('translatePrompt').value = settings.translatePrompt;

            // TTS 设置
            document.getElementById('ttsVoice').value = settings.ttsVoice;
            document.getElementById('ttsSpeed').value = settings.ttsSpeed;
        }
        else {
            showToast('设置项信息不完整，请检查！', 'error', null);
        }
    } catch (error) {
        console.error('加载设置时发生错误:', error);
        showToast('加载设置时发生错误', 'error');
    }
}

// 加载默认设置
async function resetSettings() {
    if (confirm('确定要获取默认设置吗？')) {
        try {
            // 从服务器获取默认配置
            const defaultConfig = await loadConfig(true);

            // 更新表单值
            document.getElementById('baseUrl').value = defaultConfig.baseUrl;
            document.getElementById('apiKey').value = defaultConfig.apiKey;
            document.getElementById('model').value = defaultConfig.model;
            document.getElementById('evalPrompt').value = defaultConfig.evalPrompt;
            document.getElementById('translatePrompt').value = defaultConfig.translatePrompt;
            document.getElementById('ttsVoice').value = defaultConfig.ttsVoice;
            document.getElementById('ttsSpeed').value = defaultConfig.ttsSpeed;

            showToast('设置已重置为默认值，保存后生效！', 'success', 5000);
        } catch (error) {
            console.error('默认设置获取失败:', error);
            showToast('默认设置获取失败', 'error');
        }
    }
}

// 调用 OpenAI API
async function callOpenAI(prompt) {
    const settings = StorageManager.getSettings() || '{}';
    const response = await fetch(`${settings.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify({
            model: settings.model,
            messages: [{
                role: "user",
                content: prompt
            }]
        })
    });
    const data = await response.json();
    return data.choices[0].message.content;
}

// 添加加载状态管理
const LoadingManager = {
    show(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.add('loading');
        }
    },
    hide(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('loading');
        }
    }
};

// 评价翻译质量
async function evaluateTranslation() {
    const original = document.getElementById('original').value;
    const translation = document.getElementById('translation').value;
    const resultElement = document.getElementById('result');

    if (!original || !translation) {
        showToast('请输入原文和译文', 'error');
        return;
    }

    try {
        LoadingManager.show('result');
        resultElement.innerHTML = '评价中...';

        const settings = StorageManager.getSettings();
        const prompt = settings.evalPrompt
            .replace('{original}', original)
            .replace('{translation}', translation);

        const result = await callOpenAI(prompt);
        resultElement.innerHTML = formatEvaluationResult(result);
    } catch (error) {
        console.error('评价失败:', error);
        showToast('评价失败：' + error.message, 'error');
        resultElement.innerHTML = '评价失败';
    } finally {
        LoadingManager.hide('result');
    }
}

// 评价结果格式化函数
function formatEvaluationResult(text) {
    // 分割文本为行
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    let html = '<div class="evaluation-content">';
    let inSection = false;

    lines.forEach(line => {
        // 清理行中的markdown标记（**）
        let cleanLine = line.replace(/\*\*/g, '');

        // 检查是否是新的章节（以数字开头）
        if (/^\d+\./.test(cleanLine)) {
            // 如果已经在一个章节中，关闭前一个章节
            if (inSection) {
                html += '</div>';
            }

            // 将章节标题和内容分开
            const [title, ...contentParts] = cleanLine.split('：');
            const content = contentParts.join('：'); // 重新组合可能包含多个冒号的内容

            // 开始新的章节
            html += `
                <div class="eval-section">
                    <div class="eval-title">${title}</div>
                    <div class="eval-content">
            `;

            // 如果标题后面有内容，直接添加
            if (content) {
                html += `<div class="eval-text">${content}</div>`;
            }

            inSection = true;
        }
        // 处理以 - 开头的列表项
        else if (cleanLine.startsWith('-')) {
            const bulletText = cleanLine.substring(1).trim();
            html += `<div class="eval-bullet">${bulletText}</div>`;
        }
        // 处理普通文本行
        else if (cleanLine) {
            html += `<div class="eval-text">${cleanLine}</div>`;
        }
    });

    // 关闭最后一个章节
    if (inSection) {
        html += '</div></div>';
    }

    html += '</div>';
    return html;
}

// 添加工具函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 优化文本选择处理
const debouncedHandleTextSelection = debounce(handleTextSelection, 300);
document.getElementById('original').addEventListener('mouseup', debouncedHandleTextSelection);
document.getElementById('original').addEventListener('keyup', debouncedHandleTextSelection);

function handleTextSelection(e) {
    const selectedText = window.getSelection().toString().trim();
    const actionTips = document.getElementById('actionTips');
    const resultTip = document.getElementById('resultTip');

    if (selectedText && selectedText !== currentSelection) {
        // 清空之前的翻译结果
        document.getElementById('translationResult').textContent = '';
        resultTip.style.display = 'none';

        // 获取鼠标位置
        const mouseX = e.pageX;
        const mouseY = e.pageY;

        // 设置动作tip位置
        actionTips.style.display = 'block';
        actionTips.style.position = 'absolute';
        actionTips.style.left = mouseX + 'px';
        actionTips.style.top = (mouseY + 20) + 'px'; // 在鼠标下方20px处显示

        currentSelection = selectedText;
    } else if (!selectedText) {
        actionTips.style.display = 'none';
        resultTip.style.display = 'none';
        currentSelection = '';
    }
}


// 点击其他地方时隐藏tips
document.addEventListener('click', function(e) {
    const actionTips = document.getElementById('actionTips');
    const resultTip = document.getElementById('resultTip');

    // 如果点击的是操作按钮或其子元素，不处理
    if (e.target.closest('#translateBtn') || e.target.closest('#playBtn')) {
        return;
    }

    // 如果点击的不是tips相关元素和原文框，则隐藏tips
    if (!e.target.closest('#actionTips') &&
        !e.target.closest('#original')) {
        actionTips.style.display = 'none';
        resultTip.style.display = 'none';
        currentSelection = '';
    }
});

// 获取选中的待翻译文本
function getSourceContext(selectedText) {
    const textarea = document.getElementById('original');
    const fullText = textarea.value;
    const markedText = fullText.replace(
        selectedText,
        '<TRANSLATE_THIS>' + selectedText + '</TRANSLATE_THIS>'
    );
    return `<SOURCE_TEXT>\n  ${markedText}\n</SOURCE_TEXT>`;
}

// 翻译结果格式化
function formatTranslationResult(text) {
    // 分割文本为行
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    // 创建HTML结构
    let html = `<div class="translation-content">`;

    // 添加原文（第一行）和播放图标
    html += `
        <div class="result-header">
            <div class="original-text">${lines[0]}</div>
            <div class="play-icon" title="播放" onclick="playSelectedText(event, '${lines[0].replace(/'/g, "\\'")}')">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
            </div>
        </div>
    `;

    // 处理剩余内容
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        // 检查是否包含冒号
        if (line.includes(':')) {
            const [label, value] = line.split(':').map(part => part.trim());
            html += `
                <div class="translation-section">
                    <span class="section-label">${label}:</span>
                    ${value ? `<span class="section-value">${value}</span>` : ''}
                </div>
            `;
        } else {
            html += `
                <div class="translation-section">
                    <span class="section-value">${line}</span>
                </div>
            `;
        }
    }

    html += '</div>';
    return html;
}

// 保存单词到生词本
function saveToVocabulary(word, translation) {
    // 获取现有词汇列表，确保是数组
    let vocabulary = StorageManager.getVocabulary();
    if (!Array.isArray(vocabulary)) {
        vocabulary = [];
    }

    // 检查是否已存在
    if (!vocabulary.some(item => item.word === word)) {
        vocabulary.push({
            word: word,
            translation: translation,
            timestamp: new Date().toISOString()
        });
        StorageManager.saveVocabulary(vocabulary);
        showToast('已添加到生词本', 'success');
    }
}

// 翻译结果播放功能
function playSelectedText(event, text) {
    event.stopPropagation();
    playTTS(text);
}

// 显示生词本
function showVocabulary() {
    // 获取词汇列表，确保是数组
    const vocabulary = StorageManager.getVocabulary();
    const vocabularyList = document.getElementById('vocabularyList');
    vocabularyList.innerHTML = '';

    if (Array.isArray(vocabulary) && vocabulary.length > 0) {
        vocabulary.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'vocabulary-item';

            // 创建内容容器
            const contentDiv = document.createElement('div');
            contentDiv.className = 'vocabulary-content';
            // 使用innerHTML解析HTML内容
            contentDiv.innerHTML = item.translation;

            // 创建删除按钮
            const deleteButton = document.createElement('button');
            deleteButton.className = 'delete-word-btn';
            deleteButton.onclick = () => deleteWord(index);
            deleteButton.textContent = '删除';

            // 添加内容和删除按钮
            div.appendChild(contentDiv);
            div.appendChild(deleteButton);
            vocabularyList.appendChild(div);
        });
    } else {
        // 显示空状态
        vocabularyList.innerHTML = '<div class="vocabulary-item">暂无生词</div>';
    }

    document.getElementById('vocabularyModal').style.display = 'block';
}


// 关闭生词本
function closeVocabulary() {
    document.getElementById('vocabularyModal').style.display = 'none';
}

// 删除单个单词
function deleteWord(index) {
    let vocabulary = StorageManager.getVocabulary();
    if (!Array.isArray(vocabulary)) {
        vocabulary = [];
        return;
    }

    vocabulary.splice(index, 1);
    StorageManager.saveVocabulary(vocabulary);
    showVocabulary(); // 刷新显示
    showToast('已删除', 'success');
}

// 清空生词本
function clearVocabulary() {
    if (confirm('确定要清空生词本吗？')) {
        StorageManager.remove('vocabulary');
        showVocabulary(); // 刷新显示
        showToast('生词本已清空', 'success');
    }
}

// 显示提示信息
function showToast(message, type = 'success', duration = 2000) {
    const toast = document.getElementById('toast');

    // 清除可能存在的定时器
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
    }
    if (toast.hideTimeoutId) {
        clearTimeout(toast.hideTimeoutId);
    }

    // 重置样式和显示状态
    toast.style.display = 'block';
    toast.style.opacity = '1';

    // 设置消息和样式
    toast.textContent = message;
    toast.className = `toast toast-${type}`;

    // 使用 CSS transition 替代 animation
    toast.style.transition = 'all 0.3s ease';
    toast.style.transform = 'translate(-50%, 0)';

    // 如果设置了持续时间，则在指定时间后淡出
    if (duration !== null) {
        toast.timeoutId = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 20px)';

            // 等待过渡效果完成后隐藏元素
            toast.hideTimeoutId = setTimeout(() => {
                toast.style.display = 'none';
            }, 300);
        }, duration);
    }
}

// 播放音频
function playTTS(text, voice = null, rate = null) {
    AudioManager.play(text, voice, rate);
}

// 初始化时从服务器获取配置
async function loadConfig(forceLoad = false) {
    try {
        // 如果强制加载或没有本地设置时,从服务器加载默认配置
        if (forceLoad || !StorageManager.getSettings()) {
            const response = await fetch('/api/config');
            const defaultConfig = await response.json();
            return defaultConfig;
        }
        return StorageManager.getSettings();
    } catch (error) {
        console.error('加载配置失败:', error);
        return CONFIG.DEFAULT_SETTINGS;
    }
}

// 获取TTS声音列表
async function loadTTSVoices(forceRefresh = false) {
    try {
        // 如果已有缓存且不需要强制刷新，直接使用缓存
        if (cachedVoices && !forceRefresh) {
            updateVoiceSelect(cachedVoices);
            return;
        }

        const response = await fetch('/api/tts/voices');
        const voices = await response.json();

        // 更新缓存
        cachedVoices = voices;
        updateVoiceSelect(voices);
    } catch (error) {
        console.error('加载语音列表失败:', error);
        showToast('加载语音列表失败', 'error');
    }
}

// 更新下拉框
function updateVoiceSelect(voices) {
    const voiceSelect = document.getElementById('ttsVoice');
    voiceSelect.innerHTML = '<option value="">请选择语音</option>';

    // 按语言分组
    const voicesByLocale = voices.reduce((groups, voice) => {
        const locale = voice.Locale;
        if (!groups[locale]) {
            groups[locale] = [];
        }
        groups[locale].push(voice);
        return groups;
    }, {});

    // 为每个语言创建选项组
    Object.entries(voicesByLocale).forEach(([locale, localeVoices]) => {
        const group = document.createElement('optgroup');
        group.label = locale === 'zh-CN' ? '中文' : '英文';

        localeVoices.sort((a, b) => a.ShortName.localeCompare(b.ShortName));

        localeVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.ShortName;
            option.textContent = `${voice.ShortName} (${voice.Gender})`;
            group.appendChild(option);
        });

        voiceSelect.appendChild(group);
    });

    // 设置默认选中值
    const savedSettings = StorageManager.getSettings();
    if (savedSettings?.ttsVoice) {
        voiceSelect.value = savedSettings.ttsVoice;
    }
}

// 原文框切换锁定状态
function toggleLock() {
    const originalTextarea = document.getElementById('original');
    const lockButton = document.getElementById('lockButton');
    const lockIcon = lockButton.querySelector('.lock-icon');

    isLocked = !isLocked;

    if (isLocked) {
        // 锁定状态
        originalTextarea.setAttribute('readonly', 'true');
        lockIcon.textContent = '🔒';
        lockButton.classList.add('locked');
        showToast('原文已锁定', 'success');
    } else {
        // 解锁状态
        originalTextarea.removeAttribute('readonly');
        lockIcon.textContent = '🔓';
        lockButton.classList.remove('locked');
        showToast('原文已解锁', 'success');
    }
}

// 初始化语速控制
function initTTSSpeedControl() {
    const speedSlider = document.getElementById('ttsSpeed');
    const speedValue = document.getElementById('ttsSpeedValue');

    // 更新显示的值
    speedSlider.addEventListener('input', (e) => {
        speedValue.textContent = e.target.value;
    });
}

// 初始化设置页面的标签切换
function initializeSettingsTabs() {
    const tabs = document.querySelectorAll('.settings-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 移除所有活动状态
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));

            // 添加当前活动状态
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// 初始化动作按钮
function initializeActionButtons() {
    const textArea = document.getElementById('original');
    const actionTips = document.getElementById('actionTips');
    const resultTip = document.getElementById('resultTip');
    let touchTimer = null;
    let lastTap = 0;
    let touchStartPosition = null;
    let isSelecting = false;
    let currentSelection = '';

    // 保存选择范围的函数
    function saveSelection() {
        return {
            start: textArea.selectionStart,
            end: textArea.selectionEnd,
            text: textArea.value.substring(textArea.selectionStart, textArea.selectionEnd)
        };
    }

    // 恢复选择范围的函数
    function restoreSelection(savedSelection) {
        textArea.focus();
        textArea.setSelectionRange(savedSelection.start, savedSelection.end);
    }

    // 显示操作提示的函数
    function showActionTips(x, y) {
        // 获取选中的文本
        let selection;
        if (textArea.selectionStart !== textArea.selectionEnd) {
            // 对于 textarea，直接使用 selectionStart 和 selectionEnd
            selection = textArea.value.substring(textArea.selectionStart, textArea.selectionEnd);
        } else {
            // 否则使用 window.getSelection
            selection = window.getSelection().toString();
        }

        selection = selection.trim();

        if (selection && selection !== currentSelection) {
            currentSelection = selection;

            // 计算提示框位置
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const tipsWidth = actionTips.offsetWidth;
            const tipsHeight = actionTips.offsetHeight;

            // 确保提示框不超出屏幕边界
            let left = Math.max(10, Math.min(x - tipsWidth / 2, windowWidth - tipsWidth - 10));
            let top = y + 20;

            // 如果底部空间不足，将提示框显示在上方
            if (top + tipsHeight > windowHeight - 10) {
                top = y - tipsHeight - 20;
            }

            actionTips.style.display = 'block';
            actionTips.style.left = `${left}px`;
            actionTips.style.top = `${top}px`;

            // 隐藏结果提示框
            resultTip.style.display = 'none';
        }
    }

    // PC端鼠标选择文本
    textArea.addEventListener('mouseup', (e) => {
        const selection = textArea.value.substring(textArea.selectionStart, textArea.selectionEnd).trim();
        if (selection) {
            showActionTips(e.pageX, e.pageY);
        }
    });

    // 更新提示框位置
    function updateActionTipsPosition(x, y) {
        if (actionTips.style.display === 'block') {
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            const tipsWidth = actionTips.offsetWidth;
            const tipsHeight = actionTips.offsetHeight;

            let left = Math.max(10, Math.min(x - tipsWidth / 2, windowWidth - tipsWidth - 10));
            let top = y + 20;

            if (top + tipsHeight > windowHeight - 10) {
                top = y - tipsHeight - 20;
            }

            actionTips.style.left = `${left}px`;
            actionTips.style.top = `${top}px`;
        }
    }

    // 处理触摸开始事件
    textArea.addEventListener('touchstart', (e) => {
        isSelecting = false;
        touchStartPosition = {
            x: e.touches[0].pageX,
            y: e.touches[0].pageY
        };

        touchTimer = setTimeout(() => {
            const selection = window.getSelection().toString().trim();
            if (selection) {
                e.preventDefault();
                showActionTips(touchStartPosition.x, touchStartPosition.y);
            }
        }, 500);
    }, { passive: false });

    // 处理触摸移动事件
    textArea.addEventListener('touchmove', (e) => {
        isSelecting = true;
        clearTimeout(touchTimer);

        const touch = e.touches[0];
        const selection = window.getSelection().toString().trim();

        if (selection) {
            updateActionTipsPosition(touch.pageX, touch.pageY);
        }
    });

    // 处理触摸结束事件
    textArea.addEventListener('touchend', (e) => {
        clearTimeout(touchTimer);

        const selection = window.getSelection().toString().trim();
        if (selection) {
            const touch = e.changedTouches[0];

            if (isSelecting) {
                // 如果是拖拽选择，使用最后的触摸位置
                showActionTips(touch.pageX, touch.pageY);
            } else {
                // 检测双击
                const currentTime = new Date().getTime();
                const tapLength = currentTime - lastTap;

                if (tapLength < 300 && tapLength > 0) {
                    e.preventDefault();
                    showActionTips(touch.pageX, touch.pageY);
                }
            }
        }

        lastTap = new Date().getTime();
    });

    // 阻止默认的上下文菜单
    textArea.addEventListener('contextmenu', (e) => {
        if (window.getSelection().toString().trim()) {
            e.preventDefault();
        }
    });

    // 监听选择变化事件
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === textArea) {
            const selection = window.getSelection().toString().trim();
            if (!selection) {
                actionTips.style.display = 'none';
                resultTip.style.display = 'none';
                currentSelection = '';
            }
        }
    });

    // 点击其他区域隐藏提示框
    document.addEventListener('click', (e) => {
        if (!actionTips.contains(e.target) && !resultTip.contains(e.target)) {
            actionTips.style.display = 'none';
            resultTip.style.display = 'none';
            currentSelection = '';
        }
    });

    // 翻译按钮事件
    document.getElementById('translateBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        // 确保有选中的文本
        const selection = textArea.value.substring(textArea.selectionStart, textArea.selectionEnd).trim();
        if (!selection) {
            return;
        }

        const savedSelection = saveSelection();

        try {
            resultTip.style.display = 'block';

            // 计算结果提示框位置
            const actionTipsRect = actionTips.getBoundingClientRect();
            const resultTipWidth = resultTip.offsetWidth;
            const windowWidth = window.innerWidth;

            let left = Math.max(10, Math.min(
                actionTipsRect.left + (actionTips.offsetWidth - resultTipWidth) / 2,
                windowWidth - resultTipWidth - 10
            ));

            resultTip.style.left = `${left}px`;
            resultTip.style.top = `${actionTipsRect.bottom + 5}px`;

            const translationResult = document.getElementById('translationResult');
            const sourceContext = getSourceContext(selection);
            translationResult.textContent = '翻译中...';

            const settings = StorageManager.getSettings() || '{}';
            const prompt = settings.translatePrompt.replace('{sourceContext}', sourceContext);

            const result = await callOpenAI(prompt);
            const formattedResult = formatTranslationResult(result);
            translationResult.innerHTML = formattedResult;

            saveToVocabulary(selection, formattedResult);
            actionTips.style.display = 'none';

            setTimeout(() => restoreSelection(savedSelection), 0);
        } catch (error) {
            console.error('翻译失败：', error);
            translationResult.textContent = '翻译失败';
        }
    });

    // 播放按钮事件
    document.getElementById('playBtn').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        // 确保有选中的文本
        const selection = textArea.value.substring(textArea.selectionStart, textArea.selectionEnd).trim();
        if (!selection) {
            return;
        }

        const savedSelection = saveSelection();
        playTTS(selection);
        actionTips.style.display = 'none';
        setTimeout(() => restoreSelection(savedSelection), 0);
    });

    // 复制按钮事件
    document.getElementById('copyBtn').addEventListener('click', async function(e) {
        e.preventDefault();
        e.stopPropagation();

        // 确保有选中的文本
        const selection = textArea.value.substring(textArea.selectionStart, textArea.selectionEnd).trim();
        if (!selection) {
            return;
        }

        const savedSelection = saveSelection();

        try {
            // 使用新的 Clipboard API
            await navigator.clipboard.writeText(selection);
            showToast('复制成功');
            actionTips.style.display = 'none';
            setTimeout(() => restoreSelection(savedSelection), 0);
        } catch (err) {
            // 降级方案：使用传统的复制方法
            const textarea = document.createElement('textarea');
            textarea.value = selection;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();

            try {
                document.execCommand('copy');
                showToast('复制成功');
            } catch (err) {
                console.error('复制失败：', err);
                showToast('复制失败', 'error');
            }

            document.body.removeChild(textarea);
            actionTips.style.display = 'none';
            setTimeout(() => restoreSelection(savedSelection), 0);
        }
    });
}


// 将所有的初始化和事件监听整合到一个函数中
async function initializeApp() {
    try {
        // 初始化存储
        StorageManager.init();

        // 加载配置信息
        const [CONFIG] = await Promise.all([
            loadConfig(),
        ]);

        // 初始化各个组件
        initTTSSpeedControl();
        initializeSettingsTabs();
        initializeActionButtons();

        // 加载设置
        await loadSettings();

        // 加载上次的草稿
        if (DraftManager.loadDraft()) {
            showToast('已恢复上次的编辑内容', 'success');
        }

        // 启动自动保存
        DraftManager.startAutoSave();

        // 添加页面关闭前的保存
        window.addEventListener('beforeunload', () => {
            DraftManager.saveDraft();
        });

        console.log('应用初始化完成');
    } catch (error) {
        console.error('初始化应用失败:', error);
        showToast('初始化应用失败，请检查控制台', 'error');
    }
}

// 页面加载时
document.addEventListener('DOMContentLoaded', () => {
    initializeApp().catch(error => {
        console.error('初始化应用失败:', error);
        showToast('初始化应用失败，请检查控制台', 'error');
    });
});

