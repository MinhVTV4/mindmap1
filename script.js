// --- FIREBASE SDK IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    serverTimestamp,
    onSnapshot,
    writeBatch
}
from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { getAI, getGenerativeModel, GoogleAIBackend } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-ai.js";


// --- FIREBASE CONFIGURATION (Sử dụng giá trị từ file gốc của bạn) ---
const firebaseConfig = {
    apiKey: "AIzaSyDLVuv2RGAJWUjhan-5oNCkGBwQZAN60aY",
    authDomain: "vocab-91599.firebaseapp.com",
    projectId: "vocab-91599",
    storageBucket: "vocab-91599.appspot.com",
    messagingSenderId: "918212044361",
    appId: "1:918212044361:web:50b7a065fe0b22b1924198"
};

// --- MODULE-SCOPED VARIABLES (Firebase, State, etc.) ---
let app;
let auth;
let db;
let ai;
let generativeModel;

let currentUser = null;
let currentMindMapId = null;
let currentKonvaStage = null;
let currentKonvaLayer = null;
let selectedKonvaNode = null;
let mindmapNodesUnsubscribe = null;
let allNodesDataForCurrentMap = [];
let mindmapDataUnsubscribe = null;
let tempCreationLine = null;
let rightClickedKonvaNode = null;
let isEditingText = false; // Used for modal editing state as well
let editingNodeIdForModal = null; // Stores ID of node being edited in modal

const DEFAULT_NODE_STYLE = {
    backgroundColor: "#e0e0e0", textColor: "#000000", borderColor: "#555555",
    shape: "rectangle",
    width: 150, minHeight: 50, padding: 10,
    cornerRadius: 5,
    fontSize: 14, fontFamily: 'Arial',
    icon: '',
    iconSize: 16,
    iconSpacing: 5,
    lineColor: "#888888", lineWidth: 3, lineDash: []
};
const MAX_DISPLAY_LINES_IN_NODE = 4;
let contextMenuJustOpened = false;

let potentiallyDraggedNode = null;
let dragStartPointerPosition = null;
const DRAG_THRESHOLD = 10;

let longPressTimeoutId = null;
let touchStartTargetNodeForContextMenu = null;
let touchStartPointerPositionForContextMenu = null;
const LONG_PRESS_DELAY = 750;
const LONG_PRESS_MOVE_THRESHOLD = 10;
let touchStartCoordsForLongPress = { x: 0, y: 0 };

const HANDLE_RADIUS = 8;
const HANDLE_FILL = 'rgba(0,180,0,0.7)';
const HANDLE_STROKE = 'rgba(0,100,0,0.9)';
const scaleBy = 1.1;

// NEW: Grid and Snap-to-Grid Variables
let isGridVisible = false;
let isSnapToGridEnabled = false;
let gridSize = 50; // Default grid size
let gridLines = []; // To store Konva Line objects for the grid


// --- DOM ELEMENT VARIABLES ---
let nodeStylePanel, nodeShapeSelect, nodeFontFamilySelect, nodeFontSizeInput, nodeIconSelect, nodeBgColorInput, nodeTextColorInput, nodeBorderColorInput, nodeLineColorInput, nodeLineDashSelect, nodeLineWidthInput;
let contextMenu, ctxAddChildButton, ctxEditTextButton, ctxViewFullContentButton, ctxSuggestChildrenButton, ctxExpandNodeButton, ctxGenerateExamplesButton, ctxAskAiNodeButton, ctxSummarizeBranchButton, ctxGenerateActionPlanButton, ctxDeleteNodeButton, ctxGenerateOutlineButton, ctxOptimizeLayoutButton; // NEW: ctxOptimizeLayoutButton
let aiLoadingIndicator, aiResponseModalOverlay, aiResponseModalTitle, aiResponseModalBody, aiResponseModalCloseButton;
let nodeContentModalOverlay, nodeContentModalTitle, nodeContentModalBody, nodeContentModalCloseButton;
let editNodeTextModalOverlay, editNodeTextModalTitle, editNodeTextarea, editNodeTextModalSaveButton, editNodeTextModalCancelButton, editNodeTextModalCloseButton; // NEW modal elements
let authSection, loginForm, registerForm, loginEmailInput, loginPasswordInput, loginButton, showRegisterLink, registerEmailInput, registerPasswordInput, registerButton, showLoginLink, loginErrorMsg, registerErrorMsg;
let mainAppSection, mainAppTitle, userEmailDisplay, logoutButton;
let mindmapManagementView, newMindmapTitleInput, createMindmapButton;
// Renamed mindmapListUl to normalMindmapListUl for clarity
let normalMindmapListUl, normalMindmapListLoading; // Renamed
// NEW: Variables for AI mindmap list
let aiMindmapListUl, aiMindmapListLoading;
let canvasView, backToMapsListButton, currentMindmapTitleDisplay, addChildNodeButton, deleteNodeButton, zoomInButton, zoomOutButton, resetZoomButton, konvaContainer, konvaContainerLoading;
let aiTextInput, generateMindmapFromTextButton, aiMindmapTitleInput; // NEW variables for AI from text
let toggleGridCheckbox, toggleSnapToGridCheckbox, gridSizeInput; // NEW variables for grid controls


// --- UTILITY FUNCTIONS ---
function showElement(el) { if(el) el.classList.remove('hidden'); }
function hideElement(el) { if(el) el.classList.add('hidden'); }
function displayAuthError(el, message) { if(el) { el.textContent = message; showElement(el); } }
function clearAuthError(el) { if(el) { el.textContent = ''; hideElement(el); } }
function showLoadingIndicator(message) { if (aiLoadingIndicator) { aiLoadingIndicator.textContent = message || "Đang xử lý AI..."; showElement(aiLoadingIndicator); } }
function hideLoadingIndicator() { if (aiLoadingIndicator) { hideElement(aiLoadingIndicator); } }
function hideContextMenu() { if(contextMenu) hideElement(contextMenu); contextMenuJustOpened = false; }

function openAiResponseModal(title, userQuestion, aiAnswer) {
    if (aiResponseModalOverlay && aiResponseModalTitle && aiResponseModalBody) {
        aiResponseModalTitle.textContent = title || "Phản hồi từ AI";
        let contentHTML = '';
        if (userQuestion) {
            const sanitizedUserQuestion = userQuestion.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            contentHTML += `<p><strong>Đầu vào cho AI (có thể đã được rút gọn):</strong></p><pre style="max-height: 150px; overflow-y: auto; background-color: #efefef; padding: 5px; border-radius: 3px; white-space: pre-wrap; word-wrap: break-word;">${sanitizedUserQuestion}</pre>`;
        }
        const formattedAiAnswer = aiAnswer.replace(/\n/g, '<br>');
        contentHTML += `<p><strong>AI trả lời:</strong></p><div style="background-color: #f9f9f9; padding: 10px; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-size: 0.9em;">${formattedAiAnswer}</div>`;
        aiResponseModalBody.innerHTML = contentHTML;
        showElement(aiResponseModalOverlay);
        if (currentKonvaStage && currentKonvaStage.listening()) { currentKonvaStage.listening(false); }
    }
}
function closeAiResponseModal() {
    if (aiResponseModalOverlay) { hideElement(aiResponseModalOverlay); }
    if (currentKonvaStage && !currentKonvaStage.listening()) { currentKonvaStage.listening(true); }
}
function openNodeContentModal(nodeTitle, fullContent) {
    if (nodeContentModalOverlay && nodeContentModalTitle && nodeContentModalBody) {
        nodeContentModalTitle.textContent = `Nội dung: ${nodeTitle.substring(0, 30)}${nodeTitle.length > 30 ? '...' : ''}`;

        // Improved content formatting: split by paragraph (multiple newlines), then replace single newlines with <br>
        const paragraphs = fullContent.split(/\n\s*\n/); // Split by one or more newlines, possibly with spaces
        let formattedBodyHtml = paragraphs.map(p => {
            const trimmedP = p.trim();
            return trimmedP ? `<p>${trimmedP.replace(/\n/g, '<br>')}</p>` : ''; // Convert remaining newlines in paragraph to <br>
        }).join('');

        nodeContentModalBody.innerHTML = `<div class="readable-content">${formattedBodyHtml}</div>`;

        // Add Copy button (needs to be dynamically added to footer or header)
        // Let's add it to the footer dynamically.
        let modalFooter = document.querySelector('#node-content-modal-overlay .modal-footer');
        // Ensure footer exists or create it
        if (!modalFooter) {
            modalFooter = document.createElement('div');
            modalFooter.className = 'modal-footer';
            document.querySelector('#node-content-modal-overlay .modal-content').appendChild(modalFooter);
        }
        // Remove existing copy button if any, to prevent duplicates
        let existingCopyButton = modalFooter.querySelector('#copy-node-content-button');
        if (existingCopyButton) {
            existingCopyButton.remove();
        }

        const copyButton = document.createElement('button');
        copyButton.id = 'copy-node-content-button';
        copyButton.textContent = '📋 Sao chép nội dung';
        copyButton.className = 'secondary'; // Use secondary style
        copyButton.onclick = () => {
            navigator.clipboard.writeText(fullContent)
                .then(() => {
                    copyButton.textContent = '✅ Đã sao chép!';
                    setTimeout(() => copyButton.textContent = '📋 Sao chép nội dung', 2000);
                })
                .catch(err => {
                    console.error('Failed to copy text: ', err);
                    alert('Lỗi khi sao chép nội dung.');
                });
        };
        modalFooter.prepend(copyButton); // Add to the left of existing close button in footer


        showElement(nodeContentModalOverlay);
        if (currentKonvaStage && currentKonvaStage.listening()) { currentKonvaStage.listening(false); }
    }
}
function closeNodeContentModal() {
    if (nodeContentModalOverlay) { hideElement(nodeContentModalOverlay); }
    if (currentKonvaStage && !currentKonvaStage.listening()) { currentKonvaStage.listening(true); }
}

/**
 * Parses a markdown-like indented text structure into an array of node objects
 * suitable for creating a mind map. Assigns temporary IDs and parent IDs.
 *
 * @param {string} text The markdown-like text from AI.
 * @param {string} mapId The Firestore ID of the mind map this structure belongs to.
 * @returns {Array<Object>} An array of node objects with { text, level, parentId (temp), tempId }.
 */
function parseMindmapStructure(text, mapId) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const nodes = [];
    const stack = []; // To keep track of parent nodes at each level: [{tempId, level}]

    console.log("Starting parseMindmapStructure with text:", text); // DEBUG: Raw text input

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`Processing line ${i}: "${line}"`); // DEBUG: Current line

        let currentLevel = 0;
        let content = line;

        // Determine level by counting leading spaces and then checking for '- '
        // This regex captures leading spaces (group 1) and then the rest of the line (group 2)
        const match = line.match(/^(\s*)(.*)/);
        if (!match) {
            console.warn(`Skipping line due to parse error (no match): "${line}"`);
            continue;
        }

        const leadingSpaces = match[1]; // e.g., "  ", "    "
        content = match[2]; // Content after leading spaces, before stripping bullet

        // Calculate level based on leading spaces. Assume 2 spaces per level.
        currentLevel = Math.floor(leadingSpaces.length / 2);

        // Now, strip the leading '- ' if present in the content part
        if (content.startsWith('- ')) {
            content = content.substring(2).trim(); // Remove '- ' and then trim
        } else if (content.startsWith('-')) { // Handle single hyphen without space (e.g., "- Root")
            content = content.substring(1).trim(); // Remove '-' and then trim
        } else {
            content = content.trim(); // Just trim if no bullet
        }

        if (!content) { // Skip empty content lines after stripping markers
            console.log(`Skipping empty content line after stripping: "${line}"`);
            continue;
        }

        const tempId = `node-${Date.now()}-${i}`; // Unique temporary ID for this node

        let parentTempId = null;
        // Adjust stack based on current level
        // Pop elements from stack if their level is >= current node's level
        while (stack.length > 0 && stack[stack.length - 1].level >= currentLevel) {
            stack.pop();
        }
        // The new parent is the last element on the stack (if any)
        if (stack.length > 0) {
            parentTempId = stack[stack.length - 1].tempId;
        }

        const newNode = {
            mapId: mapId,
            text: content, // Use the stripped content
            level: currentLevel,
            tempId: tempId,
            parentId: parentTempId,
        };

        nodes.push(newNode);
        stack.push(newNode); // Add current node to stack as a potential parent for its children

        console.log(`  Parsed: Level=${newNode.level}, Content="${newNode.text}", ParentId=${newNode.parentId}`); // DEBUG: Parsed node details
    }
    console.log("Parsed nodes (Revised):", nodes); // DEBUG: Check final parsed nodes array
    return nodes;
}


// --- AUTHENTICATION LOGIC ---
async function handleRegister() {
    if (!auth) {
         displayAuthError(registerErrorMsg, "Lỗi: Dịch vụ xác thực chưa sẵn sàng.");
         return;
    }
    const email = registerEmailInput.value;
    const password = registerPasswordInput.value;
    clearAuthError(registerErrorMsg);
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        // No need to manually call authStateChangedHandler, onAuthStateChanged will handle it
    } catch (error) {
        console.error("Register error:", error);
        displayAuthError(registerErrorMsg, "Lỗi đăng ký: " + error.code + " - " + error.message);
    }
}
async function handleLogin() {
    if (!auth) {
         displayAuthError(loginErrorMsg, "Lỗi: Dịch vụ xác thực chưa sẵn sàng.");
         return;
    }
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    clearAuthError(loginErrorMsg);
    try {
        await signInWithEmailAndPassword(auth, email, password);
        // No need to manually call authStateChangedHandler, onAuthStateChanged will handle it
    } catch (error) {
        console.error("Login error:", error);
        displayAuthError(loginErrorMsg, "Lỗi đăng nhập: " + error.code + " - " + error.message);
    }
}
async function handleLogout() {
    if (!auth) return;
    try {
        await signOut(auth);
        // onAuthStateChanged will handle UI changes
        currentMindMapId = null; // Reset current map ID
        if (mindmapNodesUnsubscribe) mindmapNodesUnsubscribe(); // Unsubscribe from node listeners
        if (mindmapDataUnsubscribe) mindmapDataUnsubscribe(); // Unsubscribe from map data listeners
        window.removeEventListener('keydown', handleGlobalKeyDown); // Remove global key listener
    } catch (error) {
        console.error("Logout error:", error);
    }
}
function authStateChangedHandler(user) {
    if (user) {
        currentUser = user;
        if(userEmailDisplay) userEmailDisplay.textContent = `Chào, ${user.email}`;
        hideElement(authSection);
        showElement(mainAppSection);
        showMindmapManagementView(); // Show the list of mind maps
        loadUserMindMaps(); // Load maps for the current user
    } else {
        currentUser = null;
        if(userEmailDisplay) userEmailDisplay.textContent = '';
        showElement(authSection);
        hideElement(mainAppSection);
        hideElement(canvasView); // Hide canvas if logged out
        if(nodeStylePanel) hideElement(nodeStylePanel);
        hideContextMenu();
        if(normalMindmapListUl) normalMindmapListUl.innerHTML = ''; // Clear normal mind map list
        if(aiMindmapListUl) aiMindmapListUl.innerHTML = ''; // Clear AI mind map list
        window.removeEventListener('keydown', handleGlobalKeyDown);
    }
}

// --- UI VIEW MANAGEMENT ---
function showMindmapManagementView() {
    if(mainAppTitle) mainAppTitle.textContent = "Bảng điều khiển";
    if(mindmapManagementView) showElement(mindmapManagementView);
    if(canvasView) hideElement(canvasView);
    if(nodeStylePanel) hideElement(nodeStylePanel);
    hideContextMenu();
    currentMindMapId = null;
    selectedKonvaNode = null;
    rightClickedKonvaNode = null;
    if (mindmapNodesUnsubscribe) {
        mindmapNodesUnsubscribe();
        mindmapNodesUnsubscribe = null;
    }
    if (mindmapDataUnsubscribe) {
        mindmapDataUnsubscribe();
        mindmapDataUnsubscribe = null;
    }
    if (currentKonvaStage) {
        currentKonvaStage.destroyChildren(); // Clear canvas
        currentKonvaLayer = null; // Reset layer
    }
    window.removeEventListener('keydown', handleGlobalKeyDown); // Remove key listener for canvas
}
async function showCanvasView(mapId, mapTitle) {
    if(mainAppTitle) mainAppTitle.textContent = "Sơ đồ tư duy";
    if(mindmapManagementView) hideElement(mindmapManagementView);
    if(canvasView) showElement(canvasView);
    if(currentMindmapTitleDisplay) currentMindmapTitleDisplay.textContent = mapTitle;
    currentMindMapId = mapId;
    initKonvaStage(); // Initialize Konva for the selected map
    // Listen for canvas state changes (zoom/pan)
    if (db && currentMindMapId) {
        const mapDocRef = doc(db, "mindmaps", currentMindMapId);
        if (mindmapDataUnsubscribe) mindmapDataUnsubscribe(); // Unsubscribe previous listener
        mindmapDataUnsubscribe = onSnapshot(mapDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const mapData = docSnap.data();
                if (mapData.canvasState && currentKonvaStage) {
                    currentKonvaStage.scaleX(mapData.canvasState.scaleX || 1);
                    currentKonvaStage.scaleY(mapData.canvasState.scaleY || 1);
                    currentKonvaStage.x(mapData.canvasState.x || 0);
                    currentKonvaStage.y(mapData.canvasState.y || 0);

                    // NEW: Load grid and snap states
                    isGridVisible = mapData.canvasState.isGridVisible || false;
                    isSnapToGridEnabled = mapData.canvasState.isSnapToGridEnabled || false;
                    gridSize = mapData.canvasState.gridSize || 50;

                    // Update UI elements
                    if (toggleGridCheckbox) toggleGridCheckbox.checked = isGridVisible;
                    if (toggleSnapToGridCheckbox) toggleSnapToGridCheckbox.checked = isSnapToGridEnabled;
                    if (gridSizeInput) gridSizeInput.value = gridSize;

                    updateGrid(); // Redraw grid based on loaded state

                    currentKonvaStage.batchDraw();
                }
            }
        }, (error) => {
            console.error("Error listening to mindmap data:", error);
        });
    }
    if(nodeStylePanel) hideElement(nodeStylePanel); // Hide style panel initially
    hideContextMenu();
    window.addEventListener('keydown', handleGlobalKeyDown); // Add key listener for canvas
}

// --- NODE STYLE PANEL LOGIC ---
function lineDashArrayToString(dashArray) {
    if (!dashArray || dashArray.length === 0) return 'solid';
    if (JSON.stringify(dashArray) === JSON.stringify([15, 8])) return 'dashed';
    if (JSON.stringify(dashArray) === JSON.stringify([3, 8])) return 'dotted';
    return 'solid'; // Default
}
function stringToLineDashArray(dashString) {
    if (dashString === 'dashed') return [15, 8];
    if (dashString === 'dotted') return [3, 8];
    return []; // Solid
}
function updateNodeStylePanel(nodeData) {
    if (!nodeData || !nodeData.style) {
        if(nodeStylePanel) hideElement(nodeStylePanel);
        return;
    }
    const style = nodeData.style;
    if(nodeShapeSelect) nodeShapeSelect.value = style.shape || DEFAULT_NODE_STYLE.shape;
    if(nodeFontFamilySelect) nodeFontFamilySelect.value = style.fontFamily || DEFAULT_NODE_STYLE.fontFamily;
    if(nodeFontSizeInput) nodeFontSizeInput.value = style.fontSize || DEFAULT_NODE_STYLE.fontSize;
    if(nodeIconSelect) nodeIconSelect.value = style.icon || '';
    if(nodeBgColorInput) nodeBgColorInput.value = style.backgroundColor || DEFAULT_NODE_STYLE.backgroundColor;
    if(nodeTextColorInput) nodeTextColorInput.value = style.textColor || DEFAULT_NODE_STYLE.textColor;
    if(nodeBorderColorInput) nodeBorderColorInput.value = style.borderColor || DEFAULT_NODE_STYLE.borderColor;
    if(nodeLineColorInput) nodeLineColorInput.value = style.lineColor || DEFAULT_NODE_STYLE.lineColor;
    if(nodeLineDashSelect) nodeLineDashSelect.value = lineDashArrayToString(style.lineDash);
    if(nodeLineWidthInput) nodeLineWidthInput.value = style.lineWidth || DEFAULT_NODE_STYLE.lineWidth;
    if(nodeStylePanel) showElement(nodeStylePanel);
}
async function handleNodeStyleChange(property, value) {
    if (!selectedKonvaNode || !db) return;
    const nodeId = selectedKonvaNode.id();
    let processedValue = value;
    if (property === 'lineWidth' || property === 'fontSize') {
        processedValue = parseInt(value, 10);
    } else if (property === 'lineDash') {
        processedValue = stringToLineDashArray(value);
    }
    try {
        const nodeRef = doc(db, "nodes", nodeId);
        const nodeSnap = await getDoc(nodeRef);
        if (nodeSnap.exists()) {
            const existingData = nodeSnap.data();
            const existingStyle = existingData.style || {};
            let updatedStyle = { ...existingStyle, [property]: processedValue };

            // Adjust cornerRadius based on shape
            if (property === 'shape') {
                if (processedValue === 'ellipse') {
                    // Ellipse doesn't use cornerRadius in Konva Rect, it's a separate shape
                } else if (processedValue === 'rectangle' && !updatedStyle.cornerRadius) {
                    updatedStyle.cornerRadius = 0; // Default for sharp rectangle
                } else if (processedValue === 'roundedRectangle' && (!updatedStyle.cornerRadius || updatedStyle.cornerRadius === 0) ) {
                    updatedStyle.cornerRadius = 5; // Default for rounded rectangle
                }
            }
            await updateDoc(nodeRef, { style: updatedStyle });
            // Real-time update will be handled by onSnapshot in renderNodesAndLines
        } else {
            console.warn("Node not found for style update:", nodeId);
        }
    } catch (e) {
        console.error(`Error updating node style (${property}):`, e);
    }
}
function calculatePotentialFullHeight(text, styleConfig) {
    const style = { ...DEFAULT_NODE_STYLE, ...styleConfig };
    const textPadding = style.padding;
    let iconTextWidth = 0;
    if (style.icon && style.icon !== '') {
        const tempIconForCalc = new Konva.Text({ text: style.icon, fontSize: style.iconSize, fontFamily: style.fontFamily });
        iconTextWidth = tempIconForCalc.width() + style.iconSpacing;
    }
    const mainTextWidth = style.width - 2 * textPadding - iconTextWidth;

    // Create a temporary Konva.Text to measure actual height
    const tempText = new Konva.Text({
        text: text,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        width: mainTextWidth > 0 ? mainTextWidth : 0, // Prevent negative width
        align: 'center',
        lineHeight: 1.2 // Consistent line height
    });
    const actualTextContentHeight = tempText.height();
    // Ensure minHeight is respected and icon height is considered
    return Math.max(style.minHeight, actualTextContentHeight + 2 * textPadding, style.icon ? (style.iconSize + 2 * textPadding) : 0);
}

// --- FIRESTORE SERVICE LOGIC (Mind Maps) ---
async function handleCreateMindmap() {
    if (!db) { alert("Lỗi: Dịch vụ cơ sở dữ liệu chưa sẵn sàng."); return; }
    const title = newMindmapTitleInput.value.trim();
    if (!title) { alert("Vui lòng nhập tiêu đề cho sơ đồ."); return; }
    if (!currentUser) { alert("Vui lòng đăng nhập để tạo sơ đồ."); return; }

    try {
        const mindMapData = {
            userId: currentUser.uid,
            title: title,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp(),
            type: 'normal', // NEW: Add type for normal mind map
            canvasState: {
                scaleX: 1, scaleY: 1, x: 0, y: 0,
                isGridVisible: false, // NEW: Default grid off
                isSnapToGridEnabled: false, // NEW: Default snap off
                gridSize: 50 // NEW: Default grid size
            }
        };
        const mindMapDocRef = await addDoc(collection(db, "mindmaps"), mindMapData);

        // Create a default root node for the new mind map
        const rootNodeData = {
            mapId: mindMapDocRef.id,
            parentId: null, // Root node has no parent
            text: "Ý tưởng trung tâm",
            position: { x: (konvaContainer?.clientWidth || 800) / 2 - 75, y: 50 }, // Centered horizontally, near top
            style: { ...DEFAULT_NODE_STYLE, backgroundColor: "#1877f2", textColor: "#ffffff", borderColor: "#0e5aab", shape: "ellipse", minHeight: 60 },
            createdAt: serverTimestamp()
        };
        await addDoc(collection(db, "nodes"), rootNodeData);
        newMindmapTitleInput.value = ''; // Clear input field
    } catch (e) {
        console.error("Error creating new mind map: ", e);
        alert("Lỗi khi tạo sơ đồ: " + e.message);
    }
}
async function loadUserMindMaps() {
    if (!currentUser || !db) return;

    // Clear previous lists and show loading indicators
    if(normalMindmapListLoading) showElement(normalMindmapListLoading);
    if(aiMindmapListLoading) showElement(aiMindmapListLoading); // Show AI loading initially
    if(normalMindmapListUl) normalMindmapListUl.innerHTML = '';
    if(aiMindmapListUl) aiMindmapListUl.innerHTML = '';

    // Unsubscribe from any previous listeners to prevent duplicates or outdated listeners
    if (typeof window.normalMindmapsListenerUnsubscribe === 'function') {
        window.normalMindmapsListenerUnsubscribe();
    }
    if (typeof window.aiMindmapsListenerUnsubscribe === 'function') {
        window.aiMindmapsListenerUnsubscribe();
    }

    try {
        // Query for normal mind maps
        const qNormal = query(collection(db, "mindmaps"),
                              where("userId", "==", currentUser.uid),
                              where("type", "==", "normal"));
        window.normalMindmapsListenerUnsubscribe = onSnapshot(qNormal, (querySnapshot) => {
            if(normalMindmapListUl) normalMindmapListUl.innerHTML = ''; // Clear list on each update
            if (querySnapshot.empty) {
                if(normalMindmapListUl) normalMindmapListUl.innerHTML = '<li>Bạn chưa có sơ đồ thường nào.</li>';
            }
            querySnapshot.forEach((docSnap) => {
                const map = { id: docSnap.id, ...docSnap.data() };
                const li = document.createElement('li');
                li.textContent = map.title;
                li.dataset.mapId = map.id;
                li.dataset.mapTitle = map.title;

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Xóa';
                deleteButton.classList.add('danger', 'secondary');
                deleteButton.onclick = async (e) => {
                    e.stopPropagation();
                    if (window.confirm(`Bạn có chắc muốn xóa sơ đồ "${map.title}" và tất cả các nút của nó?`)) {
                        await deleteMindMap(map.id);
                    }
                };
                li.appendChild(deleteButton);
                li.addEventListener('click', () => {
                    showCanvasView(map.id, map.title);
                });
                if(normalMindmapListUl) normalMindmapListUl.appendChild(li);
            });
            if(normalMindmapListLoading) hideElement(normalMindmapListLoading);
        }, (error) => {
            console.error("Error fetching normal mind maps: ", error);
            if(normalMindmapListUl) normalMindmapListUl.innerHTML = '<li>Lỗi khi tải danh sách sơ đồ thường.</li>';
            if(normalMindmapListLoading) hideElement(normalMindmapListLoading);
        });

        // Query for AI-generated mind maps
        const qAI = query(collection(db, "mindmaps"),
                          where("userId", "==", currentUser.uid),
                          where("type", "==", "ai"));
        window.aiMindmapsListenerUnsubscribe = onSnapshot(qAI, (querySnapshot) => {
            if(aiMindmapListUl) aiMindmapListUl.innerHTML = ''; // Clear list on each update
            if (querySnapshot.empty) {
                if(aiMindmapListUl) aiMindmapListUl.innerHTML = '<li>Bạn chưa có sơ đồ AI nào.</li>';
            }
            querySnapshot.forEach((docSnap) => {
                const map = { id: docSnap.id, ...docSnap.data() };
                const li = document.createElement('li');
                li.textContent = map.title;
                li.dataset.mapId = map.id;
                li.dataset.mapTitle = map.title;

                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Xóa';
                deleteButton.classList.add('danger', 'secondary');
                deleteButton.onclick = async (e) => {
                    e.stopPropagation();
                    if (window.confirm(`Bạn có chắc muốn xóa sơ đồ "${map.title}" và tất cả các nút của nó?`)) {
                        await deleteMindMap(map.id);
                    }
                };
                li.appendChild(deleteButton);
                li.addEventListener('click', () => {
                    showCanvasView(map.id, map.title);
                });
                if(aiMindmapListUl) aiMindmapListUl.appendChild(li);
            });
            if(aiMindmapListLoading) hideElement(aiMindmapListLoading);
        }, (error) => {
            console.error("Error fetching AI mind maps: ", error);
            if(aiMindmapListUl) aiMindmapListUl.innerHTML = '<li>Lỗi khi tải danh sách sơ đồ AI.</li>';
            if(aiMindmapListLoading) hideElement(aiMindmapListLoading);
        });

    } catch (e) {
        console.error("Error setting up mind map listeners: ", e);
        if(normalMindmapListUl) normalMindmapListUl.innerHTML = '<li>Lỗi khi tải danh sách sơ đồ.</li>';
        if(aiMindmapListUl) aiMindmapListUl.innerHTML = '<li>Lỗi khi tải danh sách sơ đồ.</li>';
        if(normalMindmapListLoading) hideElement(normalMindmapListLoading);
        if(aiMindmapListLoading) hideElement(aiMindmapListLoading);
    }
}
async function deleteMindMap(mapId) {
    if (!mapId || !db) return;
    try {
        // 1. Delete all nodes associated with this mind map
        const nodesQuery = query(collection(db, "nodes"), where("mapId", "==", mapId));
        const nodesSnapshot = await getDocs(nodesQuery);
        const batch = writeBatch(db);
        nodesSnapshot.forEach(nodeDoc => {
            batch.delete(doc(db, "nodes", nodeDoc.id));
        });
        await batch.commit();

        // 2. Delete the mind map document itself
        await deleteDoc(doc(db, "mindmaps", mapId));
        // The onSnapshot listener for mind maps will automatically update the list
    } catch (error) {
        console.error("Error deleting mind map: ", error);
        alert("Lỗi khi xóa sơ đồ: " + e.message);
    }
}

// --- FIRESTORE SERVICE LOGIC (Nodes) & KONVA INTEGRATION ---
// START: Pinch to Zoom Helper functions
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}
function getCenter(p1, p2) {
    return {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
    };
}
let lastCenter = null;
let lastDist = 0;
// END: Pinch to Zoom Helper functions

function initKonvaStage() {
    // Clear previous stage and layer if they exist
    if (currentKonvaStage) {
        currentKonvaStage.off('dragstart dragmove dragend click tap wheel contextmenu touchstart touchend touchmove mousedown mousemousemove mouseup'); // Remove all event listeners
        currentKonvaStage.destroy();
        currentKonvaStage = null;
    }
    if (currentKonvaLayer) {
        currentKonvaLayer.destroy();
        currentKonvaLayer = null;
    }

    const container = document.getElementById('konva-container');
    if (!container) {
        console.error("Konva container not found!");
        return;
    }

    currentKonvaStage = new Konva.Stage({
        container: 'konva-container',
        width: container.clientWidth,
        height: container.clientHeight,
        draggable: true, // Stage itself is draggable for panning
    });
    currentKonvaLayer = new Konva.Layer();
    currentKonvaStage.add(currentKonvaLayer);
    selectedKonvaNode = null; // Reset selected node

    // Mousedown/Touchstart for pinch-zoom and potential drag start
    currentKonvaStage.on('mousedown touchstart', function(e_stage) {
        let hitShape = e_stage.target;
        let determinedTargetNodeGroup = null;

        // Pinch-to-zoom: Check for two touches
        const touches = e_stage.evt.touches;
        if (touches && touches.length === 2) {
            e_stage.evt.preventDefault(); // Prevent default browser zoom/scroll
            currentKonvaStage.draggable(false); // Disable stage dragging during pinch
            const touch1 = touches[0];
            const touch2 = touches[1];
            lastCenter = getCenter({ x: touch1.clientX, y: touch1.clientY }, { x: touch2.clientX, y: touch2.clientY });
            lastDist = getDistance({ x: touch1.clientX, y: touch1.clientY }, { x: touch2.clientX, y: touch2.clientY });
            potentiallyDraggedNode = null; // Ensure no node dragging during pinch
            return; // Stop further processing for mousedown/touchstart if it's a pinch start
        }


        if (hitShape === currentKonvaStage) { // Clicked on empty stage area
            potentiallyDraggedNode = null;
            currentKonvaStage.draggable(true); // Ensure stage is draggable
            clearTimeout(longPressTimeoutId); // Clear any pending long press
            touchStartTargetNodeForContextMenu = null;
        } else { // Clicked on a shape within the stage
            // Traverse up to find the 'mindmapNodeGroup'
            let currentShape = hitShape;
            while (currentShape && currentShape !== currentKonvaStage) {
                if (currentShape.hasName && currentShape.hasName('mindmapNodeGroup')) {
                    determinedTargetNodeGroup = currentShape;
                    break;
                }
                if (typeof currentShape.getParent !== 'function') { // Safety check
                    determinedTargetNodeGroup = null; break;
                }
                currentShape = currentShape.getParent();
            }

            if (determinedTargetNodeGroup) { // A mindmap node was hit
                potentiallyDraggedNode = determinedTargetNodeGroup;
                dragStartPointerPosition = currentKonvaStage.getPointerPosition();
                if (currentKonvaStage.isDragging()) currentKonvaStage.stopDrag(); // Stop stage drag if active
                currentKonvaStage.draggable(false); // Disable stage dragging when a node might be dragged

                // Long press for context menu on touch devices
                if (e_stage.type === 'touchstart') {
                    touchStartTargetNodeForContextMenu = determinedTargetNodeGroup;
                    const touch = e_stage.evt.touches && e_stage.evt.touches[0];
                    if (touch) {
                        touchStartCoordsForLongPress = { x: touch.pageX, y: touch.pageY };
                        touchStartPointerPositionForContextMenu = { x: touch.pageX, y: touch.pageY }; // Use pageX/Y for menu position
                    } else { // Fallback if touch object is not available (should not happen for touchstart)
                        const pointerPos = currentKonvaStage.getPointerPosition() || {x:0, y:0};
                        touchStartCoordsForLongPress = pointerPos;
                        touchStartPointerPositionForContextMenu = pointerPos;
                    }

                    clearTimeout(longPressTimeoutId); // Clear previous timeout
                    longPressTimeoutId = setTimeout(() => {
                        if (touchStartTargetNodeForContextMenu) { // If still the same target after delay
                            rightClickedKonvaNode = touchStartTargetNodeForContextMenu;
                            // Select the node if not already selected
                            if (!selectedKonvaNode || selectedKonvaNode.id() !== rightClickedKonvaNode.id()) {
                                if (selectedKonvaNode) { selectedKonvaNode.findOne('.nodeShape')?.strokeWidth(1); removeCreationHandle(selectedKonvaNode); }
                                selectedKonvaNode = rightClickedKonvaNode;
                                selectedKonvaNode.findOne('.nodeShape')?.strokeWidth(3);
                                const shape = selectedKonvaNode.findOne('.nodeShape');
                                if (shape) addCreationHandle(selectedKonvaNode, shape.height());
                                const nodeData = allNodesDataForCurrentMap.find(n => n.id === selectedKonvaNode.id());
                                if (nodeData) updateNodeStylePanel(nodeData);
                                currentKonvaLayer.batchDraw();
                            }
                            // Show context menu at touch position
                            if (contextMenu && touchStartPointerPositionForContextMenu) {
                                contextMenu.style.top = touchStartPointerPositionForContextMenu.y + 'px';
                                contextMenu.style.left = touchStartPointerPositionForContextMenu.x + 'px';
                                showElement(contextMenu);
                                contextMenuJustOpened = true;
                            }
                            touchStartTargetNodeForContextMenu = null; // Reset for next long press
                            longPressTimeoutId = null;
                        }
                    }, LONG_PRESS_DELAY);
                }
            } else { // Clicked on something else (e.g., a line, or an unhandled shape)
                potentiallyDraggedNode = null;
                currentKonvaStage.draggable(true); // Ensure stage is draggable
                clearTimeout(longPressTimeoutId);
                touchStartTargetNodeForContextMenu = null;
            }
        }
    });

    // Mousemove/Touchmove for pinch-zoom and node dragging
    currentKonvaStage.on('mousemove touchmove', function(e_stage) {
        const touches = e_stage.evt.touches;

        // Pinch-to-zoom logic
        if (touches && touches.length === 2) { // Only process if two touches are active
            e_stage.evt.preventDefault(); // Prevent default browser zoom/scroll

            const touch1 = touches[0];
            const touch2 = touches[1];

            const currentCenter = getCenter({ x: touch1.clientX, y: touch1.clientY }, { x: touch2.clientX, y: touch2.clientY });
            const currentDist = getDistance({ x: touch1.clientX, y: touch1.clientY }, { x: touch2.clientX, y: touch2.clientY });

            if (lastDist > 0) { // Only zoom if a previous distance was recorded (i.e., pinch has started)
                const pointTo = { // Calculate mouse pointer position relative to the stage
                    x: (currentCenter.x - currentKonvaStage.x()) / currentKonvaStage.scaleX(),
                    y: (currentCenter.y - currentKonvaStage.y()) / currentKonvaStage.scaleY(),
                };

                const newScale = currentKonvaStage.scaleX() * (currentDist / lastDist); // Calculate new scale

                currentKonvaStage.scale({ x: newScale, y: newScale });
                
                // Calculate new position of the stage
                const dx = currentCenter.x - lastCenter.x;
                const dy = currentCenter.y - lastCenter.y;

                const newPos = {
                    x: currentCenter.x - pointTo.x * newScale + dx,
                    y: currentCenter.y - pointTo.y * newScale + dy,
                };
                currentKonvaStage.position(newPos);
                currentKonvaStage.batchDraw();
            }

            lastDist = currentDist;
            lastCenter = currentCenter;
            potentiallyDraggedNode = null; // Ensure no node dragging during pinch
            currentKonvaStage.draggable(false); // Disable stage dragging during pinch
            return; // Stop further processing for mousemove/touchmove if it's a pinch
        }


        // Cancel long press if finger moves too much
        if (touchStartTargetNodeForContextMenu && e_stage.type === 'touchmove') {
            const touch = e_stage.evt.touches && e_stage.evt.touches[0];
            if (touch) {
                const deltaX = Math.abs(touch.pageX - touchStartCoordsForLongPress.x);
                const deltaY = Math.abs(touch.pageY - touchStartCoordsForLongPress.y);
                if (deltaX > LONG_PRESS_MOVE_THRESHOLD || deltaY > LONG_PRESS_MOVE_THRESHOLD) {
                    clearTimeout(longPressTimeoutId); // Cancel long press
                    touchStartTargetNodeForContextMenu = null;
                }
            }
        }

        // Node dragging logic
        if (!potentiallyDraggedNode || !dragStartPointerPosition) {
            return; // Not a drag operation or drag hasn't started
        }
        // For mousemove, ensure primary button is pressed (for desktop)
        if (e_stage.type === 'mousemove' && e_stage.evt.buttons !== 1) {
            return;
        }
        const currentPointerPosition = currentKonvaStage.getPointerPosition();
        if (!currentPointerPosition) return; // Safety check
        const dx = currentPointerPosition.x - dragStartPointerPosition.x;
        const dy = currentPointerPosition.y - dragStartPointerPosition.y;

        // Only start dragging if moved beyond threshold
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
            if (potentiallyDraggedNode.draggable() === false) { // If not already dragging
                potentiallyDraggedNode.draggable(true); // Make it draggable
                potentiallyDraggedNode.startDrag(e_stage.evt); // Start Konva drag
            }
            clearTimeout(longPressTimeoutId); // Cancel long press if dragging starts
            touchStartTargetNodeForContextMenu = null;
        }
    });

    // Mouseup/Touchend to reset states
    currentKonvaStage.on('mouseup touchend', function(e_stage) {
        clearTimeout(longPressTimeoutId); // Clear any pending long press
        touchStartTargetNodeForContextMenu = null;
        potentiallyDraggedNode = null; // Reset potentially dragged node
        dragStartPointerPosition = null; // Reset drag start position

        // Reset pinch zoom state
        if (lastDist > 0) { // Was pinching
            saveCanvasState(); // Save state after pinch zoom ends
        }
        lastDist = 0;
        lastCenter = null;

        currentKonvaStage.draggable(true); // Re-enable stage dragging
    });


    currentKonvaStage.on('dragend', saveCanvasState); // For stage drag
    currentKonvaStage.on('wheel', (e) => { // For mouse wheel zoom
        e.evt.preventDefault();
        const oldScale = currentKonvaStage.scaleX();
        const pointer = currentKonvaStage.getPointerPosition();
        if (!pointer) return; // Safety check

        const mousePointTo = {
            x: (pointer.x - currentKonvaStage.x()) / oldScale,
            y: (pointer.y - currentKonvaStage.y()) / oldScale,
        };
        const direction = e.evt.deltaY > 0 ? -1 : 1; // Corrected direction for standard wheel behavior (up = zoom in, down = zoom out)
        let newScale;
        if (direction > 0) { // Zoom in
             newScale = oldScale * scaleBy;
        } else { // Zoom out
             newScale = oldScale / scaleBy;
        }

        currentKonvaStage.scale({ x: newScale, y: newScale });
        const newPos = {
            x: pointer.x - mousePointTo.x * newScale,
            y: pointer.y - mousePointTo.y * newScale,
        };
        currentKonvaStage.position(newPos);
        currentKonvaStage.batchDraw();
        saveCanvasState(); // Save state after zoom
    });

    currentKonvaStage.on('click tap', function(e) {
        if (e.target === currentKonvaStage) { // Clicked on empty stage area
            if (selectedKonvaNode) { // Deselect any currently selected node
                selectedKonvaNode.findOne('.nodeShape')?.strokeWidth(1); // Reset stroke
                removeCreationHandle(selectedKonvaNode); // Remove creation handle
                selectedKonvaNode = null;
                if(nodeStylePanel) hideElement(nodeStylePanel); // Hide style panel
                currentKonvaLayer.batchDraw();
            }
            hideContextMenu(); // Hide context menu if open
        }
        // Node click/tap is handled by the group's event listener
    });

    currentKonvaStage.on('contextmenu', function(e_context) {
        e_context.evt.preventDefault(); // Prevent default browser context menu
        if (e_context.evt.pointerType === 'touch') { // Ignore contextmenu from touch (handled by long press)
            return;
        }

        let hitShape = e_context.target;
        let determinedTargetNodeGroup = null;

        // Traverse up to find the 'mindmapNodeGroup'
        let currentShape = hitShape;
        while (currentShape && currentShape !== currentKonvaStage) {
            if (currentShape.hasName && currentShape.hasName('mindmapNodeGroup')) {
                determinedTargetNodeGroup = currentShape;
                break;
            }
            if (typeof currentShape.getParent !== 'function') { // Safety check
                determinedTargetNodeGroup = null; break;
            }
            currentShape = currentShape.getParent();
        }

        if (determinedTargetNodeGroup) { // A mindmap node was right-clicked
            rightClickedKonvaNode = determinedTargetNodeGroup;
            // Select the node if not already selected
            if (!selectedKonvaNode || selectedKonvaNode.id() !== rightClickedKonvaNode.id()) {
                if (selectedKonvaNode) { selectedKonvaNode.findOne('.nodeShape')?.strokeWidth(1); removeCreationHandle(selectedKonvaNode); }
                selectedKonvaNode = rightClickedKonvaNode;
                selectedKonvaNode.findOne('.nodeShape')?.strokeWidth(3);
                const shape = selectedKonvaNode.findOne('.nodeShape');
                if (shape) addCreationHandle(selectedKonvaNode, shape.height());
                const nodeData = allNodesDataForCurrentMap.find(n => n.id === selectedKonvaNode.id());
                if (nodeData) updateNodeStylePanel(nodeData);
                currentKonvaLayer.batchDraw();
            }
            // Show context menu at mouse position
            if(contextMenu) {
                contextMenu.style.top = e_context.evt.pageY + 'px';
                contextMenu.style.left = e_context.evt.pageX + 'px';
                showElement(contextMenu);
                contextMenuJustOpened = true;
            }
        } else { // Right-clicked on empty area or non-node element
            rightClickedKonvaNode = null;
            hideContextMenu();
        }
    });
    loadAndListenNodesForCurrentMap(); // Load nodes for the current map
}
async function saveCanvasState() {
    if (!currentKonvaStage || !currentMindMapId || !db || !currentUser) return;
    try {
        const mapRef = doc(db, "mindmaps", currentMindMapId);
        await updateDoc(mapRef, {
            "canvasState.scaleX": currentKonvaStage.scaleX(),
            "canvasState.scaleY": currentKonvaStage.scaleY(),
            "canvasState.x": currentKonvaStage.x(),
            "canvasState.y": currentKonvaStage.y(),
            "canvasState.isGridVisible": isGridVisible, // NEW
            "canvasState.isSnapToGridEnabled": isSnapToGridEnabled, // NEW
            "canvasState.gridSize": gridSize, // NEW
            lastModified: serverTimestamp() // Update last modified timestamp
        });
    } catch (error) {
        console.error("Error saving canvas state:", error);
    }
}
function loadAndListenNodesForCurrentMap() {
    if (!currentMindMapId || !currentKonvaLayer || !db) {
        console.warn("Cannot load nodes: Missing mapId, layer, or db connection.");
        return;
    }
    if(konvaContainerLoading) showElement(konvaContainerLoading);
    if(currentKonvaLayer) currentKonvaLayer.destroyChildren(); // Clear previous nodes
    if(currentKonvaLayer) currentKonvaLayer.draw(); // Redraw empty layer
     allNodesDataForCurrentMap = []; // Reset local cache

    const q = query(collection(db, "nodes"), where("mapId", "==", currentMindMapId));
    if (mindmapNodesUnsubscribe) mindmapNodesUnsubscribe(); // Unsubscribe from previous listener

    mindmapNodesUnsubscribe = onSnapshot(q, (querySnapshot) => {
        const nodesFromDb = [];
        querySnapshot.forEach((docSnap) => {
            nodesFromDb.push({ id: docSnap.id, ...docSnap.data() });
        });
        allNodesDataForCurrentMap = nodesFromDb; // Update local cache
        console.log("Nodes from DB (onSnapshot):", allNodesDataForCurrentMap); // DEBUG: Check data from Firestore
        renderNodesAndLines(allNodesDataForCurrentMap); // Re-render all nodes and lines
        if(konvaContainerLoading) hideElement(konvaContainerLoading);
    }, (error) => {
        console.error(`Error listening to nodes for map ${currentMindMapId}:`, error);
        alert("Lỗi khi tải các nút của sơ đồ: " + error.message);
        if(konvaContainerLoading) hideElement(konvaContainerLoading);
    });
}

// NEW: Function to draw grid
function updateGrid() {
    if (!currentKonvaLayer || !currentKonvaStage) return;

    // Remove existing grid lines by name
    currentKonvaLayer.find('.gridLine').forEach(line => line.destroy());
    gridLines = []; // Clear the array

    if (isGridVisible) {
        const stageWidth = currentKonvaStage.width();
        const stageHeight = currentKonvaStage.height();

        // Draw vertical lines
        for (let i = 0; i * gridSize < stageWidth; i++) {
            const x = i * gridSize;
            const line = new Konva.Line({
                points: [x, 0, x, stageHeight],
                stroke: '#e0e0e0', // Light grey
                strokeWidth: 0.5,
                listening: false, // Don't capture events
                name: 'gridLine' // Name for easy removal
            });
            currentKonvaLayer.add(line);
            gridLines.push(line);
        }

        // Draw horizontal lines
        for (let i = 0; i * gridSize < stageHeight; i++) {
            const y = i * gridSize;
            const line = new Konva.Line({
                points: [0, y, stageWidth, y],
                stroke: '#e0e0e0', // Light grey
                strokeWidth: 0.5,
                listening: false, // Don't capture events
                name: 'gridLine' // Name for easy removal
            });
            currentKonvaLayer.add(line);
            gridLines.push(line);
        }
    }
    currentKonvaLayer.batchDraw();
}

// NEW: Function to snap position to grid
function snapToGrid(pos) {
    if (!isSnapToGridEnabled || !gridSize) return pos;
    return {
        x: Math.round(pos.x / gridSize) * gridSize,
        y: Math.round(pos.y / gridSize) * gridSize,
    };
}


function renderNodesAndLines(nodesData) {
    if (!currentKonvaLayer) return;
    currentKonvaLayer.destroyChildren(); // Clear existing shapes
    const konvaNodeObjects = {}; // To store Konva group objects for linking

    // Re-draw grid first, so it's always at the bottom
    updateGrid();

    nodesData.forEach(nodeData => {
        // Basic validation for node data
        if (!nodeData.position || typeof nodeData.position.x !== 'number' || typeof nodeData.position.y !== 'number') {
            console.warn("Node data missing valid position, skipping:", nodeData);
            return;
        }

        const style = { ...DEFAULT_NODE_STYLE, ...(nodeData.style || {}) };
        const fullText = nodeData.text || "";

        // Calculate available width for text considering padding and icon
        let iconWidthForCalc = 0;
        if (style.icon && style.icon !== '') {
            const tempIcon = new Konva.Text({ text: style.icon, fontSize: style.iconSize, fontFamily: style.fontFamily });
            iconWidthForCalc = tempIcon.width() + style.iconSpacing;
        }
        const textRenderWidth = style.width - (2 * style.padding) - iconWidthForCalc;

        // Determine text display height and if truncation is needed
        const tempTextObj = new Konva.Text({
            text: fullText,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            width: textRenderWidth > 0 ? textRenderWidth : 0, // Prevent negative width
            lineHeight: 1.2, // Consistent line height
            align: 'center'
        });
        const fullTextActualHeight = tempTextObj.height(); // Actual height of the full text

        const estimatedLineHeight = style.fontSize * 1.2;
        const maxVisibleTextHeightInNode = estimatedLineHeight * MAX_DISPLAY_LINES_IN_NODE;
        const isTextTruncated = fullTextActualHeight > maxVisibleTextHeightInNode;
        // NEW: Truncate text content directly for display
        let displayText = fullText;
        if (isTextTruncated) {
            // A simple way to truncate text to fit max lines, may need more complex logic for perfect fit
            const words = fullText.split(' ');
            let currentLines = 0;
            let truncatedWords = [];
            let tempLineHeightCheck = new Konva.Text({
                fontSize: style.fontSize, fontFamily: style.fontFamily, width: textRenderWidth
            });

            for (let k = 0; k < words.length; k++) {
                const testText = truncatedWords.concat(words[k]).join(' ');
                tempLineHeightCheck.text(testText);
                if (tempLineHeightCheck.height() / estimatedLineHeight > MAX_DISPLAY_LINES_IN_NODE) {
                    break; // Exceeded max lines
                }
                truncatedWords.push(words[k]);
            }
            displayText = truncatedWords.join(' ');
            // Ensure we don't add "..." if the text is already short enough
            if (displayText.length < fullText.length) {
                displayText += '...';
            }
        }


        const textDisplayHeight = isTextTruncated ? maxVisibleTextHeightInNode : fullTextActualHeight;

        // Calculate shape height based on text, minHeight, and "Read more" indicator
        let shapeRenderHeight = Math.max(style.minHeight, textDisplayHeight + (2 * style.padding));

        if (isTextTruncated) {
            const readMoreIndicatorHeight = estimatedLineHeight * 0.8; // Approximate height for "Xem thêm"
            // Ensure shape is tall enough for text + padding + "Read more"
            shapeRenderHeight = Math.max(shapeRenderHeight, textDisplayHeight + (2 * style.padding) + readMoreIndicatorHeight + style.padding * 0.5);
        }

        // Create Konva Group for the node
        const group = new Konva.Group({
            x: nodeData.position.x,
            y: nodeData.position.y,
            draggable: false, // Will be enabled on drag start after threshold
            id: nodeData.id,
            name: 'mindmapNodeGroup',
            fullTextData: fullText // Store full text in an attribute for easy access
        });

        // Create the main shape (rectangle, ellipse, etc.)
        let shape;
        if (style.shape === 'ellipse') {
            shape = new Konva.Ellipse({
                x: style.width / 2, y: shapeRenderHeight / 2, // Center of ellipse
                radiusX: style.width / 2, radiusY: shapeRenderHeight / 2,
                fill: style.backgroundColor, stroke: style.borderColor, strokeWidth: 1, name: 'nodeShape'
            });
        } else if (style.shape === 'roundedRectangle') {
            shape = new Konva.Rect({
                width: style.width, height: shapeRenderHeight,
                fill: style.backgroundColor, stroke: style.borderColor, strokeWidth: 1,
                cornerRadius: style.cornerRadius || 10, name: 'nodeShape' // Default cornerRadius if not specified
            });
        } else { // Default to rectangle
            shape = new Konva.Rect({
                width: style.width, height: shapeRenderHeight,
                fill: style.backgroundColor, stroke: style.borderColor, strokeWidth: 1,
                cornerRadius: 0, name: 'nodeShape' // No corner radius for plain rectangle
            });
        }
        group.add(shape);
        shape.moveToBottom(); // Ensure shape is behind text and icon

        // Add icon if specified
        if (style.icon && style.icon !== '') {
            const iconObject = new Konva.Text({
                text: style.icon, fontSize: style.iconSize, fontFamily: style.fontFamily, fill: style.textColor,
                x: style.padding, // Position icon with padding
                y: (shapeRenderHeight - style.iconSize) / 2, // Vertically center icon
                listening: false, // Icon itself shouldn't capture events
                name: 'nodeIcon'
            });
            group.add(iconObject);
        }

        // Create text object for display (potentially truncated)
        const textToRender = new Konva.Text({
            text: displayText, // Use truncated text for display
            fontSize: style.fontSize, fontFamily: style.fontFamily, fill: style.textColor,
            width: textRenderWidth > 0 ? textRenderWidth : 0, // Prevent negative width
            height: textDisplayHeight, // Set to calculated display height
            x: style.padding + iconWidthForCalc, // Position text after icon and padding
            y: style.padding, // Position text with padding from top
            align: 'center', // Center align text
            verticalAlign: 'top', // Align text to the top of its bounding box
            lineHeight: 1.2, // Consistent line height
            listening: true, // Text should be clickable/tappable
            name: 'nodeTextContent'
        });

        // No need for textToRender.clip() anymore as text is pre-truncated

        // Add "Read more" indicator if text was truncated
        if (isTextTruncated) {
             const readMoreText = new Konva.Text({
                x: style.padding + iconWidthForCalc, // Align with main text
                y: style.padding + textDisplayHeight + style.padding * 0.2, // Position below truncated text
                text: '... Xem thêm',
                fontSize: style.fontSize * 0.8, // Smaller font for indicator
                fill: '#007bff', // Link-like color
                fontStyle: 'italic',
                name: 'readMoreIndicator',
                width: textRenderWidth, // Same width as text block for alignment
                align: 'right' // Align to the right
            });
            group.add(readMoreText);
            // Event listener for "Read more"
            readMoreText.on('click tap', (ev) => {
                const isPrimaryInteraction = (ev.evt.button === 0 && ev.type === 'click') || ev.type === 'tap';
                if (isPrimaryInteraction && !contextMenuJustOpened) { // Avoid conflict with context menu
                    openNodeContentModal(nodeData.text.substring(0,30)+"...", fullText);
                } else if (contextMenuJustOpened) {
                    contextMenuJustOpened = false; // Reset flag if context menu was just opened
                }
                ev.evt.cancelBubble = true; // Prevent event bubbling to the group
            });
        }
        group.add(textToRender);

        // REMOVED: The problematic listener that opened modal on text click
        // if (isTextTruncated) {
        //     textToRender.on('click tap', (ev) => {
        //         const isPrimaryInteraction = (ev.evt.button === 0 && ev.type === 'click') || ev.type === 'tap';
        //         if (isPrimaryInteraction && !contextMenuJustOpened) {
        //             openNodeContentModal(nodeData.text.substring(0,30)+"...", fullText);
        //         } else if (contextMenuJustOpened) {
        //             contextMenuJustOpened = false;
        //         }
        //         ev.evt.cancelBubble = true;
        //     });
        // }

        // Event listener for node drag end
        group.on('dragend', async function() {
            if(!db) return;
            let finalX = this.x();
            let finalY = this.y();

            if (isSnapToGridEnabled) {
                const snappedPos = snapToGrid({ x: finalX, y: finalY });
                finalX = snappedPos.x;
                finalY = snappedPos.y;
                this.position({ x: finalX, y: finalY }); // Update Konva node position to snapped position
                currentKonvaLayer.batchDraw(); // Redraw immediately after snap
            }

            try {
                await updateDoc(doc(db, "nodes", this.id()), { position: { x: finalX, y: finalY } });
            } catch (e) {
                console.error("Error updating node position:", e);
            }
            this.draggable(false); // Disable draggable after drag ends (re-enabled on mousedown if needed)
        });

        // Event listener for node click/tap (selection)
        group.on('click tap', function(e) {
            e.evt.cancelBubble = true; // Prevent event bubbling to the stage
            if (isEditingText) return; // Prevent selection if modal is open
            if (e.target.name() === 'readMoreIndicator') return; // Handled by its own listener
            if (this.isDragging && this.isDragging()) { return; } // Don't select if it was a drag operation

            const isPrimaryInteraction = (e.evt.button === 0 && e.type === 'click') || e.type === 'tap';

            if (isPrimaryInteraction) {
                if (contextMenuJustOpened) { // If context menu was just opened by this click/tap (e.g., long press)
                    contextMenuJustOpened = false; // Reset the flag
                } else { // If it's a normal click/tap not related to context menu opening
                    // This is for selection, not opening modal.
                    // The modal opening is now exclusively handled by the 'readMoreIndicator'
                }
            }

            // Node selection logic
            if (selectedKonvaNode && selectedKonvaNode !== this) { // Deselect previous node
                selectedKonvaNode.findOne('.nodeShape')?.strokeWidth(1);
                removeCreationHandle(selectedKonvaNode);
            }
            selectedKonvaNode = this; // Select current node
            const shapeNode = this.findOne('.nodeShape');
            if (shapeNode) {
              shapeNode.strokeWidth(3); // Highlight selected node
              addCreationHandle(this, shapeNode.height()); // Add creation handle
            }

            const clickedNodeData = allNodesDataForCurrentMap.find(n => n.id === this.id());
            if (clickedNodeData) updateNodeStylePanel(clickedNodeData); // Update style panel
            currentKonvaLayer.batchDraw(); // Redraw layer

            // Hide context menu if a primary click occurs outside of it
            if (isPrimaryInteraction && contextMenu && !contextMenu.classList.contains('hidden')) {
                if (!contextMenu.contains(e.target)) { // If click is outside context menu
                     hideContextMenu();
                }
            }
        });
        // UPDATED: Call new editTextOnKonvaNode for dblclick/dbltap
        group.on('dblclick dbltap', function() {
            editTextOnKonvaNode(this); // Pass the group directly
            hideContextMenu(); // Hide context menu if open
        });

        konvaNodeObjects[nodeData.id] = group; // Store Konva group for line drawing
        currentKonvaLayer.add(group);

        // If this node was previously selected, re-apply selected state
        if (selectedKonvaNode && selectedKonvaNode.id() === nodeData.id) {
            shape.strokeWidth(3);
            addCreationHandle(group, shape.height());
        }
    });

    // Draw lines between parent and child nodes
    nodesData.forEach(nodeData => {
        if (nodeData.parentId && konvaNodeObjects[nodeData.parentId] && konvaNodeObjects[nodeData.id]) {
            const parentKonvaNode = konvaNodeObjects[nodeData.parentId];
            const childKonvaNode = konvaNodeObjects[nodeData.id];
            const parentNodeFromData = allNodesDataForCurrentMap.find(n=>n.id === nodeData.parentId); // Get parent's full data for style

            const parentRenderedShape = parentKonvaNode.findOne('.nodeShape');
            const childRenderedShape = childKonvaNode.findOne('.nodeShape');

            // Ensure shapes exist before trying to get dimensions
            if (!parentRenderedShape || !childRenderedShape) {
                console.warn("Skipping line: parent or child shape not found for line between", nodeData.parentId, "and", nodeData.id);
                return;
            }

            const parentActualHeight = parentRenderedShape.height();
            const childActualHeight = childRenderedShape.height();
            const parentActualWidth = parentRenderedShape.width();
            const childActualWidth = childRenderedShape.width();

            const parentStyle = { ...DEFAULT_NODE_STYLE, ...(parentNodeFromData?.style || {}) }; // Use parent's line style

            const line = new Konva.Line({
                points: [
                    parentKonvaNode.x() + parentActualWidth / 2, parentKonvaNode.y() + parentActualHeight / 2, // Center of parent
                    childKonvaNode.x() + childActualWidth / 2, childKonvaNode.y() + childActualHeight / 2    // Center of child
                ],
                stroke: parentStyle.lineColor,
                strokeWidth: parentStyle.lineWidth,
                dash: parentStyle.lineDash,
                lineCap: 'round',
                lineJoin: 'round',
                name: 'connectionLine'
            });
            currentKonvaLayer.add(line);
            line.moveToBottom(); // Draw lines behind nodes
        }
    });
    currentKonvaLayer.batchDraw(); // Redraw the layer with all nodes and lines
}
function addCreationHandle(parentNodeGroup, parentCurrentShapeHeight) {
    if (!parentNodeGroup || parentNodeGroup.findOne('.creationHandle')) return; // Don't add if exists

    const parentShapeInitial = parentNodeGroup.findOne('.nodeShape');
    if (!parentShapeInitial) {
        console.error("addCreationHandle: parentShapeInitial is undefined. Cannot add handle to node:", parentNodeGroup.id());
        return;
    }
    const shapeWidth = parentShapeInitial.width();
    // Position handle at the bottom-center of the shape
    let handleX = shapeWidth / 2;
    let handleY = parentCurrentShapeHeight; // Use the passed current height
    // Adjust for ellipse if needed (though typically a rect/roundedRect is better for this handle)
    if (parentShapeInitial.getClassName() === 'Ellipse') {
        handleX = parentShapeInitial.x(); // Ellipse x is center
        handleY = parentShapeInitial.y() + parentShapeInitial.radiusY(); // Bottom edge of ellipse
    }

    const handle = new Konva.Circle({
        x: handleX, y: handleY, radius: HANDLE_RADIUS, fill: HANDLE_FILL,
        stroke: HANDLE_STROKE, strokeWidth: 1, draggable: true, name: 'creationHandle',
        dragDistance: 3, // Minimum distance to start drag
        dragBoundFunc: function(pos) { // Keep handle within parent's local coordinate system
            const parentAbsPos = parentNodeGroup.getAbsolutePosition();
            return {
                x: pos.x - parentAbsPos.x, // Convert absolute pos to relative
                y: pos.y - parentAbsPos.y,
            };
        }
    });
    parentNodeGroup.add(handle);
    parentNodeGroup.creationHandle = handle; // Store reference

    handle.on('dragstart', function(e) {
        e.evt.cancelBubble = true;
        if (!currentKonvaLayer || !parentNodeGroup) {
            console.error("dragstart: currentKonvaLayer or parentNodeGroup is missing");
            return;
        }
        const currentParentShape = parentNodeGroup.findOne('.nodeShape');
        if (!currentParentShape) {
            console.error("dragstart: currentParentShape is undefined. parentNodeGroup ID:", parentNodeGroup.id());
            return;
        }
        const parentNodeData = allNodesDataForCurrentMap.find(n => n.id === parentNodeGroup.id());
        const parentStyle = { ...DEFAULT_NODE_STYLE, ...(parentNodeData?.style || {}) };

        const lineColor = parentStyle.lineColor || DEFAULT_NODE_STYLE.lineColor;
        const lineWidth = parentStyle.lineWidth || DEFAULT_NODE_STYLE.lineWidth;
        let startX = currentParentShape.width() / 2;
        let startY = currentParentShape.height() / 2;
        if (currentParentShape.getClassName() === 'Ellipse') { // Adjust for ellipse center
            startX = currentParentShape.x();
            startY = currentParentShape.y();
        }
        tempCreationLine = new Konva.Line({
            points: [ startX, startY, this.x(), this.y() ], // Line from parent center to handle
            stroke: lineColor, strokeWidth: lineWidth, dash: parentStyle.lineDash || []
        });
        parentNodeGroup.add(tempCreationLine); // Add line to the same group as the handle
        currentKonvaLayer.batchDraw();
    });
    handle.on('dragmove', function(e) {
        e.evt.cancelBubble = true;
        if (tempCreationLine) {
            const points = tempCreationLine.points();
            points[2] = this.x(); // Update end point of the line to handle's current position
            points[3] = this.y();
            tempCreationLine.points(points);
            currentKonvaLayer.batchDraw();
        }
    });
    handle.on('dragend', async function(e) {
        e.evt.cancelBubble = true;
        if (tempCreationLine) { tempCreationLine.destroy(); tempCreationLine = null; }

        if (!parentNodeGroup) {
             console.error("dragend: parentNodeGroup is missing");
             // Attempt to reset handle position even if parent is gone (though unlikely)
             this.position({ x: (this.getStage()?.width() || 0) / 2, y: (this.getStage()?.height() || 0) / 2 });
             currentKonvaLayer.batchDraw();
             return;
        }
        const currentParentShapeForReset = parentNodeGroup.findOne('.nodeShape');
        if (!currentParentShapeForReset) {
            console.error("dragend: currentParentShapeForReset is undefined. parentNodeGroup ID:", parentNodeGroup.id());
            // Fallback reset position if shape is gone
            const groupWidth = parentNodeGroup.width() || DEFAULT_NODE_STYLE.width;
            const groupHeight = parentNodeGroup.height() || DEFAULT_NODE_STYLE.minHeight; // Use group height if shape height unknown
            this.position({ x: groupWidth / 2, y: groupHeight });
            currentKonvaLayer.batchDraw();
            return;
        }

        // Calculate new node's absolute position based on handle's final position
        let handleFinalRelativeX = this.x();
        let handleFinalRelativeY = this.y();
        const parentAbsPos = parentNodeGroup.getAbsolutePosition();
        let newNodeAbsX = parentAbsPos.x + handleFinalRelativeX;
        let newNodeAbsY = parentAbsPos.y + handleFinalRelativeY;

        // NEW: Apply snap to grid for new node creation
        if (isSnapToGridEnabled) {
            const snappedPos = snapToGrid({ x: newNodeAbsX, y: newNodeAbsY });
            newNodeAbsX = snappedPos.x;
            newNodeAbsY = snappedPos.y;
        }

        // Reset handle to its original position at the bottom of the parent
        let resetHandleX = currentParentShapeForReset.width() / 2;
        let resetHandleY = currentParentShapeForReset.height();
        if (currentParentShapeForReset.getClassName() === 'Ellipse') {
            resetHandleX = currentParentShapeForReset.x();
            resetHandleY = currentParentShapeForReset.y() + currentParentShapeForReset.radiusY();
        }
        this.position({ x: resetHandleX, y: resetHandleY });

        // Create the new child node in Firestore
        if (currentMindMapId && db && parentNodeGroup) {
            const defaultChildWidth = 120;
            const defaultChildMinHeight = 40;
            const defaultChildPadding = 10;
            const newNodeData = {
                mapId: currentMindMapId,
                parentId: parentNodeGroup.id(),
                text: "Nút mới (kéo)",
                position: { // Position the new node centered at the handle's drop location
                    x: newNodeAbsX - defaultChildWidth / 2,
                    y: newNodeAbsY - defaultChildMinHeight / 2
                },
                style: { ...DEFAULT_NODE_STYLE, backgroundColor: "#f9f9f9", textColor: "#333333", borderColor: "#cccccc", width: defaultChildWidth, minHeight: defaultChildMinHeight, padding: defaultChildPadding, cornerRadius: 3, shape: "rectangle", icon: '' },
                createdAt: serverTimestamp()
            };
            try { await addDoc(collection(db, "nodes"), newNodeData); }
            catch (err) { console.error("Error creating child node by dragging:", err); alert("Lỗi khi tạo nút con: " + err.message); }
        }
        currentKonvaLayer.batchDraw();
    });
    currentKonvaLayer.batchDraw();
}
function removeCreationHandle(parentNodeGroup) {
    if (parentNodeGroup && parentNodeGroup.creationHandle) {
        parentNodeGroup.creationHandle.destroy();
        parentNodeGroup.creationHandle = null; // Clear reference
        currentKonvaLayer.batchDraw();
    }
}

// --- REVISED: Node Text Editing Logic (Using Modal) ---
function editTextOnKonvaNode(konvaGroup) {
    if (!konvaGroup || isEditingText || !editNodeTextModalOverlay || !editNodeTextarea) {
        // console.warn("editTextOnKonvaNode: called with invalid params or already editing.");
        return;
    }

    const fullTextData = konvaGroup.getAttr('fullTextData') || "";
    const nodeShortText = (fullTextData.substring(0, 25) + (fullTextData.length > 25 ? "..." : "")) || "Nút không tên";

    editingNodeIdForModal = konvaGroup.id(); // Store the ID of the node being edited

    if(editNodeTextModalTitle) editNodeTextModalTitle.textContent = `Sửa nội dung: ${nodeShortText}`;
    if(editNodeTextarea) {
        editNodeTextarea.value = fullTextData;
        // Dynamically adjust textarea height based on content
        const lineCount = (fullTextData.match(/\n/g) || []).length + 1; // Count newlines + 1
        const calculatedHeight = lineCount * 20 + 20; // Approx 20px per line + 20px padding/buffer
        const newTextareaHeight = Math.min(Math.max(calculatedHeight, 150), 400); // Clamp height between 150px and 400px
        editNodeTextarea.style.height = `${newTextareaHeight}px`;
        editNodeTextarea.focus();
        // editNodeTextarea.select(); // Optional: select all text when modal opens
    }

    showElement(editNodeTextModalOverlay);

    if (currentKonvaStage && currentKonvaStage.listening()) {
        currentKonvaStage.listening(false); // Disable stage interaction while modal is open
    }
    isEditingText = true; // Set editing flag
}

function closeEditNodeModal() {
    if (editNodeTextModalOverlay) {
        hideElement(editNodeTextModalOverlay);
    }
    if (currentKonvaStage && !currentKonvaStage.listening()) {
        currentKonvaStage.listening(true); // Re-enable stage interaction
    }
    editingNodeIdForModal = null; // Clear stored node ID
    isEditingText = false; // Reset editing flag
}

async function handleSaveNodeTextFromModal() {
    if (!editingNodeIdForModal || !editNodeTextarea || !db) {
        alert("Lỗi: Không thể lưu nội dung nút. Dữ liệu cần thiết bị thiếu.");
        closeEditNodeModal();
        return;
    }
    const newFullText = editNodeTextarea.value;
    try {
        await updateDoc(doc(db, "nodes", editingNodeIdForModal), { text: newFullText });
        // Firestore onSnapshot in renderNodesAndLines will automatically trigger re-render of the node on canvas
    } catch (e) {
        console.error("Error updating node text from modal:", e);
        alert("Lỗi khi cập nhật nội dung nút: " + e.message);
    } finally {
        closeEditNodeModal(); // Close modal whether save succeeds or fails
    }
}


// --- HÀM THU THẬP DỮ LIỆU NHÁNH ---
function collectBranchDataRecursive(nodeId, allNodes, level, collectedTexts) {
    const node = allNodes.find(n => n.id === nodeId);
    if (!node) {
        return; // Node not found, stop recursion for this path
    }
    const indent = '    '.repeat(level); // Use spaces for indentation
    collectedTexts.push(indent + (node.text || "").trim()); // Add current node's text

    const children = allNodes.filter(n => n.parentId === nodeId); // Find direct children
    for (const child of children) {
        collectBranchDataRecursive(child.id, allNodes, level + 1, collectedTexts); // Recurse for each child
    }
}

/**
 * Collects the text content of a node and its ancestors up to the root,
 * forming a contextual path.
 * @param {string} nodeId The ID of the starting node.
 * @param {Array<Object>} allNodes The array of all node data in the current mind map.
 * @returns {string} A string representing the contextual path (e.g., "Root Idea > Parent Node > Current Node").
 */
function getNodeContextPath(nodeId, allNodes) {
    let path = [];
    let currentNode = allNodes.find(n => n.id === nodeId);

    // Keep track of visited nodes to prevent infinite loops in case of circular references (though Firestore data shouldn't have them)
    const visitedNodeIds = new Set(); 

    while (currentNode && !visitedNodeIds.has(currentNode.id)) {
        visitedNodeIds.add(currentNode.id);
        path.unshift(currentNode.text); // Add to the beginning to get "Ancestor > Parent > Current"
        currentNode = allNodes.find(n => n.id === currentNode.parentId);
    }
    return path.join(' > '); // Join with a separator
}


// --- AI LOGIC FUNCTIONS (Function definitions) ---
async function suggestChildNodesWithAI(targetNodeKonva) {
    if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc thiếu thông tin cần thiết.");
        hideContextMenu(); return;
    }
    const parentNodeId = targetNodeKonva.id();
    const parentNodeData = allNodesDataForCurrentMap.find(n => n.id === parentNodeId);
    if (!parentNodeData) { alert("Không tìm thấy dữ liệu nút cha."); hideContextMenu(); return; }

    const parentText = parentNodeData.text;
    const contextPath = getNodeContextPath(parentNodeId, allNodesDataForCurrentMap); // Get context for parent node

    const prompt = `Cho nút cha "${parentText}" trong ngữ cảnh "${contextPath}", hãy gợi ý 3 ý tưởng ngắn gọn (khoảng 2-5 từ mỗi ý tưởng) cho các nút con liên quan trực tiếp đến "${parentText}" và phù hợp với ngữ cảnh nhánh. Mỗi ý tưởng trên một dòng riêng biệt. Không sử dụng đánh số, gạch đầu dòng hay bất kỳ ký tự đặc biệt nào ở đầu dòng.`;

    showLoadingIndicator("AI đang tạo gợi ý...");
    hideContextMenu();
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const suggestionsText = response.text();
        const suggestions = suggestionsText.split('\n').map(s => s.trim()).filter(s => s.length > 0 && s.length < 50); // Filter and trim suggestions

        if (suggestions.length > 0) {
            const batch = writeBatch(db);
            let startX = targetNodeKonva.x();
            let startY = targetNodeKonva.y();
            const parentShape = targetNodeKonva.findOne('.nodeShape');
            const parentWidth = parentShape?.width() || DEFAULT_NODE_STYLE.width;
            const parentHeight = parentShape?.height() || DEFAULT_NODE_STYLE.minHeight;

            // Position new nodes below and slightly offset from parent
            startX += parentWidth / 4; // Offset a bit to the right
            startY += parentHeight + 30; // Below the parent
            const yOffsetIncrement = (DEFAULT_NODE_STYLE.minHeight || 50) + 20; // Spacing between new nodes

            suggestions.slice(0, 5).forEach((suggestion, index) => { // Limit to 5 suggestions
                const newNodeId = doc(collection(db, "nodes")).id; // Generate new ID locally
                const newNodeData = {
                    mapId: currentMindMapId,
                    parentId: parentNodeId,
                    text: suggestion,
                    position: { x: startX, y: startY + (index * yOffsetIncrement) },
                    style: { ...DEFAULT_NODE_STYLE, backgroundColor: "#E3F2FD", textColor: "#0D47A1", borderColor: "#90CAF9", shape: "roundedRectangle", cornerRadius: 8, width: 130, minHeight: 40, fontSize: 13, icon: '' },
                    createdAt: serverTimestamp()
                };
                const nodeRef = doc(db, "nodes", newNodeId);
                batch.set(nodeRef, newNodeData);
            });
            await batch.commit();
        } else {
            alert("AI không thể đưa ra gợi ý nào phù intimidating vào lúc này.");
        }
    } catch (error) {
        console.error("Error calling Gemini API (suggestChildNodesWithAI):", error);
        let userMessage = "Lỗi khi AI gợi ý nút con: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        alert(userMessage);
    } finally {
        hideLoadingIndicator();
    }
}
async function expandNodeWithAI(targetNodeKonva) {
    if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc thiếu thông tin nút.");
        hideContextMenu(); return;
    }
    const targetNodeId = targetNodeKonva.id();
    const targetNodeData = allNodesDataForCurrentMap.find(n => n.id === targetNodeId);
    if (!targetNodeData) { alert("Không tìm thấy dữ liệu cho nút đã chọn."); hideContextMenu(); return; }

    const currentText = targetNodeData.text;
    const contextPath = getNodeContextPath(targetNodeId, allNodesDataForCurrentMap); // Get context from ancestors

    const prompt = `Bạn là một chuyên gia sơ đồ tư duy.
Nút hiện tại trong sơ đồ tư duy có nội dung: "${currentText}"
Nút này nằm trong ngữ cảnh của nhánh: "${contextPath}"

Dựa trên ngữ cảnh này, hãy viết một đoạn văn bản chi tiết hơn (khoảng 3-5 câu) để giải thích, làm rõ hoặc mở rộng ý tưởng của nút hiện tại. Đảm bảo câu trả lời liên quan chặt chẽ đến ngữ cảnh của các nút cha và không chung chung.`;

    showLoadingIndicator("AI đang mở rộng ý tưởng...");
    hideContextMenu();
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const expandedText = response.text().trim();

        if (expandedText && expandedText !== currentText) {
            const nodeRef = doc(db, "nodes", targetNodeId);
            await updateDoc(nodeRef, { text: expandedText });
            // Firestore onSnapshot will re-render the node
        } else if (expandedText === currentText) {
            alert("AI không tìm thấy cách mở rộng thêm cho ý tưởng này.");
        }
        else {
            alert("AI không thể mở rộng ý tưởng vào lúc này.");
        }
    } catch (error) {
        console.error("Error calling Gemini API (expandNodeWithAI):", error);
        let userMessage = "Lỗi khi AI mở rộng ý tưởng: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("billing")){ userMessage = "Có vấn đề với cài đặt thanh toán cho dự án Firebase của bạn. Vui lòng kiểm tra trong Google Cloud Console."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        alert(userMessage);
    } finally {
        hideLoadingIndicator();
    }
}
async function generateExamplesWithAI(targetNodeKonva) {
     if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc thiếu thông tin nút.");
        hideContextMenu(); return;
    }
    const targetNodeId = targetNodeKonva.id();
    const targetNodeData = allNodesDataForCurrentMap.find(n => n.id === targetNodeId);
    if (!targetNodeData) { alert("Không tìm thấy dữ liệu cho nút đã chọn."); hideContextMenu(); return; }

    const currentText = targetNodeData.text;
    const contextPath = getNodeContextPath(targetNodeId, allNodesDataForCurrentMap); // Get context from ancestors

    const prompt = `Cho chủ đề sau: "${currentText}", trong ngữ cảnh nhánh: "${contextPath}", hãy tạo ra 2 hoặc 3 ví dụ cụ thể để minh họa cho chủ đề này. Các ví dụ phải phù hợp với ngữ cảnh đã cho. Mỗi ví dụ trên một dòng riêng biệt. Không dùng đánh số hay gạch đầu dòng. Các ví dụ nên ngắn gọn và dễ hiểu.`;

    showLoadingIndicator("AI đang tạo ví dụ...");
    hideContextMenu();
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const examplesText = response.text().trim();
        const examples = examplesText.split('\n').map(s => s.trim()).filter(s => s.length > 0 && s.length < 150); // Filter and trim suggestions

        if (examples.length > 0) {
            const batch = writeBatch(db);
            let startX = targetNodeKonva.x();
            let startY = targetNodeKonva.y();
            const parentShape = targetNodeKonva.findOne('.nodeShape');
            const parentWidth = parentShape?.width() || DEFAULT_NODE_STYLE.width;
            const parentHeight = parentShape?.height() || DEFAULT_NODE_STYLE.minHeight;

            startX += parentWidth / 4; // Offset a bit to the right
            startY += parentHeight + 30; // Below the parent
            const yOffsetIncrement = (DEFAULT_NODE_STYLE.minHeight || 50) + 20; // Spacing between new nodes

            examples.slice(0, 5).forEach((suggestion, index) => { // Limit to 5 suggestions
                const newNodeId = doc(collection(db, "nodes")).id;
                const exampleNodeStyle = { ...DEFAULT_NODE_STYLE, backgroundColor: "#E8F5E9", textColor: "#2E7D32", borderColor: "#A5D6A7", shape: "roundedRectangle", cornerRadius: 7, width: 160, minHeight: 40, fontSize: 13, icon: '💡' };
                const newNodeData = {
                    mapId: currentMindMapId,
                    parentId: targetNodeId,
                    text: `Ví dụ: ${suggestion}`,
                    position: { x: startX + (index * 10), y: startY + (index * yOffsetIncrement) }, // Stagger positions slightly
                    style: exampleNodeStyle,
                    createdAt: serverTimestamp()
                };
                const nodeRef = doc(db, "nodes", newNodeId);
                batch.set(nodeRef, newNodeData);
            });
            await batch.commit();
        } else {
            alert("AI không thể tạo ví dụ nào phù hợp vào lúc này.");
        }
    } catch (error) {
        console.error("Error calling Gemini API (generateExamplesWithAI):", error);
        let userMessage = "Lỗi khi AI tạo ví dụ: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        alert(userMessage);
    } finally {
        hideLoadingIndicator();
    }
}
async function askAIAboutNode(targetNodeKonva) {
    if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc thiếu thông tin nút.");
        hideContextMenu(); return;
    }
    const targetNodeId = targetNodeKonva.id();
    const targetNodeData = allNodesDataForCurrentMap.find(n => n.id === targetNodeId);
    if (!targetNodeData) { alert("Không tìm thấy dữ liệu cho nút đã chọn."); hideContextMenu(); return; }

    const nodeTextContext = targetNodeData.text;
    const contextPath = getNodeContextPath(targetNodeId, allNodesDataForCurrentMap); // Get context from ancestors
    const userQuestion = window.prompt(`Hỏi AI về nội dung của nút: "${nodeTextContext}"\nNgữ cảnh: "${contextPath}"\n\nNhập câu hỏi của bạn:`, "");

    if (!userQuestion || userQuestion.trim() === "") {
        hideContextMenu(); return; // User cancelled or entered nothing
    }

    const prompt = `Nội dung của một nút trong sơ đồ tư duy là: "${nodeTextContext}". Nút này nằm trong ngữ cảnh của nhánh: "${contextPath}".\n\nNgười dùng có câu hỏi sau về nút này: "${userQuestion.trim()}"\n\nHãy trả lời câu hỏi đó một cách ngắn gọn và súc tích, tập trung vào ngữ cảnh được cung cấp từ nút và nhánh của nó.`;
    showLoadingIndicator("AI đang trả lời câu hỏi...");
    hideContextMenu();
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const aiAnswer = response.text().trim();

        if (aiAnswer) {
            openAiResponseModal(`Hỏi AI về: "${nodeTextContext.substring(0,30)}..."`, userQuestion.trim(), aiAnswer);
        }
        else {
            openAiResponseModal(`Hỏi AI về: "${nodeTextContext.substring(0,30)}..."`, userQuestion.trim(), "AI không thể đưa ra câu trả lời vào lúc này.");
        }
    } catch (error) {
        console.error("Error calling Gemini API (askAIAboutNode):", error);
        let userMessage = "Lỗi khi AI trả lời câu hỏi: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("billing")){ userMessage = "Có vấn đề với cài đặt thanh toán cho dự án Firebase của bạn. Vui lòng kiểm tra trong Google Cloud Console."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        openAiResponseModal("Lỗi AI", userQuestion.trim(), userMessage);
    } finally {
        hideLoadingIndicator();
    }
}

async function summarizeBranchWithAI(targetNodeKonva) {
    if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc không có nút nào được chọn.");
        hideContextMenu(); return;
    }
    const rootNodeId = targetNodeKonva.id();
    const rootNodeData = allNodesDataForCurrentMap.find(n => n.id === rootNodeId);
    if (!rootNodeData) {
        alert("Không tìm thấy dữ liệu cho nút gốc của nhánh.");
        hideContextMenu(); return;
    }

    showLoadingIndicator("AI đang chuẩn bị dữ liệu để tóm tắt...");
    hideContextMenu();

    const branchTextsArray = [];
    collectBranchDataRecursive(rootNodeId, allNodesDataForCurrentMap, 0, branchTextsArray);

    if (branchTextsArray.length === 0) {
        alert("Không có dữ liệu văn bản trong nhánh này để tóm tắt.");
        hideLoadingIndicator(); return;
    }

    const branchContentForPrompt = branchTextsArray.join('\n');
    const maxContentLength = 15000; // Adjust as needed, consider token limits for the model
    let truncatedContent = branchContentForPrompt;
    let isTruncated = false;
    if (branchContentForPrompt.length > maxContentLength) {
        console.warn("Nội dung nhánh quá dài, đã được cắt bớt để gửi cho AI.");
        truncatedContent = branchContentForPrompt.substring(0, maxContentLength) + "\n... (nội dung đã được cắt bớt do quá dài)";
        isTruncated = true;
    }

    const prompt = `Bạn là một trợ lý AI xuất sắc, chuyên về phân tích và tóm tắt thông tin từ sơ đồ tư duy.
Dưới đây là nội dung của một nhánh trong sơ đồ tư duy, được trình bày theo cấu trúc phân cấp (các mục con được thụt đầu dòng tương ứng với cấp độ của chúng trong sơ đồ):
---
${truncatedContent}
---
${isTruncated ? "\LƯU Ý: Nội dung trên có thể đã được rút gọn do giới hạn độ dài.\n" : ""}
Nhiệm vụ của bạn là tạo một bản tóm tắt mạch lạc, súc tích và chính xác (khoảng 3 đến 7 câu văn, hoặc nhiều hơn một chút nếu cần thiết để bao quát ý chính) về nhánh sơ đồ tư duy này. Bản tóm tắt cần:
1. Nêu bật được ý tưởng hoặc chủ đề chính của nút gốc.
2. Đề cập đến các chủ đề con hoặc các khía cạnh quan trọng nhất được phát triển trong nhánh.
3. Chỉ ra được mối quan hệ logic chính yếu hoặc dòng chảy ý tưởng trong nhánh (nếu có).
4. Sử dụng ngôn ngữ rõ ràng, dễ hiểu.
Hãy cung cấp bản tóm tắt dưới dạng một đoạn văn bản duy nhất.`;

    showLoadingIndicator("AI đang tóm tắt nhánh...");
    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const summaryText = response.text().trim();
        const rootNodeTextPreview = (rootNodeData.text || "Không có tiêu đề").substring(0, 30) + ((rootNodeData.text || "").length > 30 ? "..." : "");

        if (summaryText) {
            // Create a new node as a child of the summarized node to display the summary
            const parentShape = targetNodeKonva.findOne('.nodeShape');
            const parentHeight = parentShape ? parentShape.height() : DEFAULT_NODE_STYLE.minHeight;
            const parentWidth = parentShape ? parentShape.width() : DEFAULT_NODE_STYLE.width;


            const newNodeData = {
                mapId: currentMindMapId,
                parentId: rootNodeId, // Child of the node that was summarized
                text: `📄 Tóm tắt nhánh:\n${summaryText}`,
                position: {
                    x: targetNodeKonva.x() + parentWidth / 4 + 10, // Position it near the parent
                    y: targetNodeKonva.y() + parentHeight + 35
                },
                style: {
                    ...DEFAULT_NODE_STYLE,
                    backgroundColor: "#FFFDE7", // Light yellow for summary
                    textColor: "#4E342E", // Dark brown text
                    borderColor: "#FFD54F", // Amber border
                    shape: "roundedRectangle",
                    cornerRadius: 6,
                    width: 250, // Wider for summary
                    minHeight: 70,
                    fontSize: 13,
                    icon: '📄'
                },
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "nodes"), newNodeData);
            alert(`AI đã tạo một nút tóm tắt con cho nhánh "${rootNodeTextPreview}".`);

        } else {
             openAiResponseModal(
                `AI Tóm tắt nhánh: "${rootNodeTextPreview}"`,
                truncatedContent, // Show what was sent to AI
                "AI không thể tạo tóm tắt cho nhánh này vào lúc này. Vui lòng thử lại hoặc kiểm tra nội dung nhánh."
            );
        }
    } catch (error) {
        console.error("Error calling Gemini API (summarizeBranchWithAI):", error);
        let userMessage = "Lỗi khi AI tóm tắt nhánh: " + error.message;
         if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        openAiResponseModal( `Lỗi AI khi tóm tắt nhánh`, truncatedContent, userMessage );
    } finally {
        hideLoadingIndicator();
    }
}
async function generateActionPlanWithAI(targetNodeKonva) {
    if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc không có nút nào được chọn.");
        hideContextMenu(); return;
    }
    const targetNodeId = targetNodeKonva.id();
    const targetNodeData = allNodesDataForCurrentMap.find(n => n.id === targetNodeId);
    if (!targetNodeData || !targetNodeData.text || targetNodeData.text.trim() === "") {
        alert("Nút được chọn không có nội dung hoặc nội dung không hợp lệ để tạo kế hoạch hành động.");
        hideContextMenu(); return;
    }

    const nodeContent = targetNodeData.text.trim();
    const contextPath = getNodeContextPath(targetNodeId, allNodesDataForCurrentMap); // Get context from ancestors
    const nodeContentPreview = nodeContent.substring(0, 30) + (nodeContent.length > 30 ? "..." : "");

    showLoadingIndicator("AI đang tạo kế hoạch hành động...");
    hideContextMenu();

    const prompt = `Bạn là một trợ lý AI chuyên nghiệp trong việc lập kế hoạch và đề xuất chiến lược hành động.
Dựa trên mục tiêu hoặc vấn đề được mô tả dưới đây:
"${nodeContent}"
Nút này nằm trong ngữ cảnh của nhánh: "${contextPath}"

Hãy đề xuất một kế hoạch hành động sơ bộ, bao gồm từ 3 đến 5 bước cụ thể, rõ ràng và có tính khả thi cao để đạt được mục tiêu hoặc giải quyết vấn đề đã nêu. Mỗi bước nên:
1. Bắt đầu bằng một động từ hành động mạnh mẽ (ví dụ: Phân tích, Xác định, Thiết kế, Xây dựng, Triển khai, Kiểm tra, Đánh giá, Tối ưu hóa).
2. Mô tả ngắn gọn nhưng đầy đủ về hành động cần thực hiện.
3. Có thể được thực hiện một cách độc lập hoặc theo trình tự logic.
Vui lòng trình bày toàn bộ kế hoạch dưới dạng một khối văn bản, với mỗi bước hành động trên một dòng riêng biệt, bắt đầu bằng số thứ tự (ví dụ: 1. ..., 2. ...).`;

    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const actionPlanText = response.text().trim();

        if (actionPlanText) {
            const parentShape = targetNodeKonva.findOne('.nodeShape');
            const parentHeight = parentShape ? parentShape.height() : DEFAULT_NODE_STYLE.minHeight;
            const parentWidth = parentShape ? parentShape.width() : DEFAULT_NODE_STYLE.width;

            const newNodeData = {
                mapId: currentMindMapId,
                parentId: targetNodeId, // Child of the node the plan is for
                text: `🚀 Kế hoạch hành động:\n${actionPlanText}`,
                position: {
                    x: targetNodeKonva.x() + parentWidth / 4 + 10,
                    y: targetNodeKonva.y() + parentHeight + 35
                },
                style: {
                    ...DEFAULT_NODE_STYLE,
                    backgroundColor: "#E3F2FD", // Light blue for action plan
                    textColor: "#0D47A1", // Dark blue text
                    borderColor: "#90CAF9", // Lighter blue border
                    shape: "roundedRectangle",
                    cornerRadius: 4,
                    width: 280, // Wider for action plan
                    minHeight: 80,
                    fontSize: 13,
                    icon: '🚀'
                },
                createdAt: serverTimestamp()
            };
            await addDoc(collection(db, "nodes"), newNodeData);
            alert(`AI đã tạo một nút kế hoạch hành động cho "${nodeContentPreview}".`);

        } else {
            openAiResponseModal(
                `Kế hoạch hành động cho: "${nodeContentPreview}"`,
                `Mục tiêu/Vấn đề: ${nodeContent}`,
                "AI không thể tạo kế hoạch hành động cho mục tiêu này vào lúc này. Vui lòng thử lại."
            );
        }
    } catch (error) {
        console.error("Error calling Gemini API (generateActionPlanWithAI):", error);
        let userMessage = "Lỗi khi AI tạo kế hoạch hành động: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        openAiResponseModal(
            `Lỗi AI khi tạo kế hoạch hành động`,
            `Mục tiêu/Vấn đề: ${nodeContent}`,
            userMessage
        );
    } finally {
        hideLoadingIndicator();
    }
}

async function generateOutlineWithAI(targetNodeKonva) {
    console.log("Attempting to generate outline with AI for node:", targetNodeKonva.id()); // Debug log
    if (!generativeModel || !targetNodeKonva || !currentMindMapId || !currentUser || !db) {
        alert("Chức năng AI chưa sẵn sàng hoặc không có nút nào được chọn.");
        hideContextMenu(); return;
    }
    const rootNodeId = targetNodeKonva.id();
    const rootNodeData = allNodesDataForCurrentMap.find(n => n.id === rootNodeId);
    if (!rootNodeData) {
        alert("Không tìm thấy dữ liệu cho nút gốc của nhánh.");
        hideContextMenu(); return;
    }

    showLoadingIndicator("AI đang tạo dàn ý...");
    hideContextMenu();

    const branchTextsArray = [];
    // Collect all text from the branch, maintaining hierarchy for the prompt
    function collectBranchTextForOutline(nodeId, allNodes, level, collectedTexts) {
        const node = allNodes.find(n => n.id === nodeId);
        if (!node) return;

        const indent = '  '.repeat(level); // Use 2 spaces for Markdown sub-levels
        collectedTexts.push(`${indent}- ${node.text || ""}`); // Markdown list item format

        const children = allNodes.filter(n => n.parentId === nodeId);
        // Sort children to maintain a consistent order in the outline if needed
        children.sort((a, b) => a.text.localeCompare(b.text)); // Simple alphabetical sort for consistency

        for (const child of children) {
            collectBranchTextForOutline(child.id, allNodes, level + 1, collectedTexts);
        }
    }

    collectBranchTextForOutline(rootNodeId, allNodesDataForCurrentMap, 0, branchTextsArray);

    if (branchTextsArray.length === 0) {
        alert("Không có dữ liệu văn bản trong nhánh này để tạo dàn ý.");
        hideLoadingIndicator(); return;
    }

    const branchContentForPrompt = branchTextsArray.join('\n');
    const maxContentLength = 15000; // Adjust as needed, consider token limits for the model
    let truncatedContent = branchContentForPrompt;
    let isTruncated = false;
    if (branchContentForPrompt.length > maxContentLength) {
        console.warn("Nội dung nhánh quá dài, đã được cắt bớt để gửi cho AI.");
        truncatedContent = branchContentForPrompt.substring(0, maxContentLength) + "\n... (nội dung đã được cắt bớt do quá dài)";
        isTruncated = true;
    }

    const prompt = `Bạn là một trợ lý AI chuyên nghiệp trong việc tạo dàn ý.
Dưới đây là cấu trúc và nội dung của một nhánh sơ đồ tư duy, được trình bày theo định dạng Markdown với các cấp độ thụt lề:
---
${truncatedContent}
---
${isTruncated ? "\LƯU Ý: Nội dung trên có thể đã được rút gọn do giới hạn độ dài.\n" : ""}
Nhiệm vụ của bạn là tạo một dàn ý chi tiết cho một bài thuyết trình, báo cáo hoặc tài liệu, dựa trên cấu trúc và ý tưởng của nhánh sơ đồ tư duy này.
Dàn ý cần tuân thủ các quy tắc sau:
1.  Sử dụng định dạng Markdown với tiêu đề cấp độ (headings: #, ##, ###) và danh sách (bullet points: * hoặc -) để thể hiện cấu trúc phân cấp.
2.  Tiêu đề cấp 1 (#) cho chủ đề chính (nút gốc của nhánh).
3.  Tiêu đề cấp 2 (##) cho các ý chính cấp độ 1 (con trực tiếp của nút gốc).
4.  Tiêu đề cấp 3 (###) hoặc danh sách con (bullet points) cho các ý phụ cấp độ 2 trở xuống.
5.  Mỗi mục trong dàn ý nên ngắn gọn, súc tích, nhưng đủ thông tin để hiểu ý tưởng.
6.  Không bao gồm bất kỳ lời giới thiệu hay kết luận nào ngoài dàn ý.

Hãy cung cấp dàn ý của bạn:`;

    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const outlineText = response.text().trim();
        const rootNodeTextPreview = (rootNodeData.text || "Không có tiêu đề").substring(0, 30) + ((rootNodeData.text || "").length > 30 ? "..." : "");

        if (outlineText) {
            openAiResponseModal(`📝 Dàn ý cho: "${rootNodeTextPreview}"`, truncatedContent, outlineText);
        } else {
            openAiResponseModal(
                `📝 Dàn ý cho: "${rootNodeTextPreview}"`,
                truncatedContent,
                "AI không thể tạo dàn ý cho nhánh này vào lúc này. Vui lòng thử lại hoặc kiểm tra nội dung nhánh."
            );
        }
    } catch (error) {
        console.error("Error calling Gemini API (generateOutlineWithAI):", error);
        let userMessage = "Lỗi khi AI tạo dàn ý: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung.";}
        openAiResponseModal( `Lỗi AI khi tạo dàn ý`, truncatedContent, userMessage );
    } finally {
        hideLoadingIndicator();
    }
}

// NEW: AI-driven Layout Optimization
async function optimizeLayoutWithAI(targetNodeId = null) {
    console.log("Attempting to optimize layout with AI. Target Node ID:", targetNodeId); // Debug log
    if (!currentKonvaStage || !currentKonvaLayer || !currentMindMapId || !db || !currentUser) {
        alert("Không thể tối ưu hóa bố cục. Canvas hoặc cơ sở dữ liệu chưa sẵn sàng.");
        return;
    }

    // FIX: Check if there are any nodes to optimize at all
    if (allNodesDataForCurrentMap.length === 0) {
        alert("Không có nút nào trong sơ đồ để tối ưu hóa bố cục.");
        hideLoadingIndicator();
        return;
    }

    showLoadingIndicator("AI đang tối ưu hóa bố cục sơ đồ...");

    let nodesToOptimize = [];
    let rootNodeForLayout = null;

    if (targetNodeId) {
        // Optimize a specific branch
        rootNodeForLayout = allNodesDataForCurrentMap.find(n => n.id === targetNodeId);
        if (!rootNodeForLayout) {
            alert("Không tìm thấy nút để tối ưu hóa bố cục.");
            hideLoadingIndicator();
            return;
        }
        // Collect all nodes in the branch
        const branchNodeIds = [rootNodeId].concat(findAllDescendantNodeIds(rootNodeId, allNodesDataForCurrentMap));
        nodesToOptimize = allNodesDataForCurrentMap.filter(n => branchNodeIds.includes(n.id));
        console.log("Optimizing branch nodes:", nodesToOptimize.map(n => n.text));
    } else {
        // Optimize the entire map
        nodesToOptimize = [...allNodesDataForCurrentMap];
        // Find a suitable root if optimizing entire map without a specified target
        // Prioritize a node with parentId === null, otherwise pick the first node
        rootNodeForLayout = allNodesDataForCurrentMap.find(n => n.parentId === null);
        if (!rootNodeForLayout && nodesToOptimize.length > 0) {
            rootNodeForLayout = nodesToOptimize[0]; // Fallback to first node if no explicit root
        }
        console.log("Optimizing entire map. Root node:", rootNodeForLayout?.text);
    }

    // FIX: If after determining the scope, nodesToOptimize is still empty or rootNodeForLayout is null
    if (nodesToOptimize.length === 0 || !rootNodeForLayout) {
        alert("Không tìm thấy nút nào phù hợp để tối ưu hóa bố cục. Đảm bảo sơ đồ có ít nhất một nút.");
        hideLoadingIndicator();
        return;
    }

    // Prepare data for layout algorithm: convert to a simpler graph structure
    const graphNodes = nodesToOptimize.map(node => ({
        id: node.id,
        text: node.text,
        parentId: node.parentId,
        level: node.level, // Use existing level or calculate if needed
        width: node.style?.width || DEFAULT_NODE_STYLE.width,
        height: node.style?.minHeight || DEFAULT_NODE_STYLE.minHeight, // Use minHeight for layout calc
    }));

    // Simple hierarchical layout algorithm (for demonstration)
    // This is a basic implementation and can be replaced with more sophisticated algorithms
    const layoutAlgorithm = (nodes, rootId, initialX, initialY, horizontalSpacing, verticalSpacing) => {
        const positions = {};
        const childrenMap = new Map();
        nodes.forEach(node => {
            if (node.parentId) {
                if (!childrenMap.has(node.parentId)) {
                    childrenMap.set(node.parentId, []);
                }
                childrenMap.get(node.parentId).push(node);
            }
        });

        // Sort children for consistent layout
        childrenMap.forEach(children => {
            children.sort((a, b) => a.text.localeCompare(b.text));
        });

        const queue = [{ id: rootId, x: initialX, y: initialY, level: 0 }];
        const visited = new Set();
        let currentLevelY = { 0: initialY }; // Tracks Y position for each level
        let currentLevelMaxX = { 0: initialX + (nodes.find(n => n.id === rootId)?.width || DEFAULT_NODE_STYLE.width) / 2 }; // Tracks max X for each level

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.id)) continue;
            visited.add(current.id);

            positions[current.id] = { x: current.x, y: current.y };

            const directChildren = childrenMap.get(current.id) || [];
            let childStartX = current.x - (directChildren.length - 1) * (horizontalSpacing + DEFAULT_NODE_STYLE.width) / 2; // Center children under parent

            directChildren.forEach((child, index) => {
                const childLevel = current.level + 1;
                const childY = (currentLevelY[childLevel] || (current.y + (nodes.find(n => n.id === current.id)?.height || DEFAULT_NODE_STYLE.minHeight) + verticalSpacing));
                
                let childX = childStartX + index * (DEFAULT_NODE_STYLE.width + horizontalSpacing);

                // Adjust X to avoid overlap with previous nodes on the same level
                if (currentLevelMaxX[childLevel] && childX < currentLevelMaxX[childLevel] + horizontalSpacing) {
                    childX = currentLevelMaxX[childLevel] + horizontalSpacing;
                }

                queue.push({ id: child.id, x: childX, y: childY, level: childLevel });
                currentLevelY[childLevel] = childY;
                currentLevelMaxX[childLevel] = childX + DEFAULT_NODE_STYLE.width;
            });
        }
        return positions;
    };

    // Find the actual root node for the layout
    let layoutRootId = rootNodeForLayout.id;
    
    // No need for this check anymore, as it's handled above
    // if (!layoutRootId) {
    //     alert("Không tìm thấy node gốc để tối ưu hóa bố cục.");
    //     hideLoadingIndicator();
    //     return;
    // }


    const initialX = (currentKonvaStage.width() / 2) - (rootNodeForLayout.width / 2 || DEFAULT_NODE_STYLE.width / 2);
    const initialY = 50;
    const horizontalSpacing = 80;
    const verticalSpacing = 60;

    const newPositions = layoutAlgorithm(graphNodes, layoutRootId, initialX, initialY, horizontalSpacing, verticalSpacing);

    // Apply updates to Firestore in a batch
    const batch = writeBatch(db);
    let updatesCount = 0;
    nodesToOptimize.forEach(node => {
        const newPos = newPositions[node.id];
        if (newPos && (node.position.x !== newPos.x || node.position.y !== newPos.y)) {
            batch.update(doc(db, "nodes", node.id), { position: newPos });
            updatesCount++;
        }
    });

    try {
        if (updatesCount > 0) {
            await batch.commit();
            alert(`AI đã tối ưu hóa bố cục cho ${updatesCount} nút.`);
        } else {
            alert("Không có thay đổi bố cục đáng kể nào được AI đề xuất.");
        }
    } catch (error) {
        console.error("Error optimizing layout:", error);
        alert("Lỗi khi tối ưu hóa bố cục: " + error.message);
    } finally {
        hideLoadingIndicator();
    }
}


async function handleGenerateMindmapFromText() {
    if (!generativeModel || !db || !currentUser) {
        alert("Chức năng AI chưa sẵn sàng hoặc bạn chưa đăng nhập.");
        return;
    }

    const textContent = aiTextInput.value.trim();
    if (!textContent) {
        alert("Vui lòng dán văn bản vào ô để AI có thể tạo sơ đồ tư duy.");
        return;
    }

    const mapTitle = aiMindmapTitleInput.value.trim() || `Sơ đồ AI từ văn bản (${new Date().toLocaleDateString()})`;

    showLoadingIndicator("AI đang đọc văn bản và tạo sơ đồ tư duy...");

    // Cấu trúc prompt để AI trả về dữ liệu có cấu trúc
    const prompt = `Bạn là một chuyên gia tạo sơ đồ tư duy. Hãy đọc văn bản sau và chuyển đổi nó thành một cấu trúc sơ đồ tư duy.
Sơ đồ tư duy cần được cấu trúc theo định dạng Markdown được thụt lề, trong đó mỗi dòng là một nút sơ đồ tư duy.
- Nút gốc (cấp 0) là ý tưởng chính hoặc tiêu đề bao quát của văn bản.
- Các nút con (cấp 1, 2, v.v.) được thụt lề bằng cách sử dụng dấu gạch ngang và dấu cách ('- ').
- Giới hạn nội dung mỗi nút khoảng 10-50 từ, cô đọng ý chính.
- Tránh lặp lại nội dung giống hệt nhau.
- Tập trung vào việc tạo ra một cấu trúc logic và dễ hiểu.
- Không bao gồm bất kỳ văn bản giới thiệu hay kết luận nào ngoài cấu trúc sơ đồ tư duy.
- Không đánh số, chỉ dùng dấu gạch đầu dòng.

Ví dụ định dạng đầu ra mong muốn:
- Nút gốc của sơ đồ tư duy
  - Nút con cấp 1 của gốc
    - Nút con cấp 2 của cấp 1
    - Nút con cấp 2 khác
  - Nút con cấp 1 thứ hai
- Nút gốc thứ hai (nếu có nhiều ý chính độc lập trong văn bản)

Văn bản đầu vào:
---
${textContent}
---

Hãy bắt đầu sơ đồ tư duy của bạn:`;

    try {
        const result = await generativeModel.generateContent(prompt);
        const response = result.response;
        const mindmapStructureText = response.text().trim();

        console.log("AI Raw Response (Mindmap Structure):", mindmapStructureText); // DEBUG: Check AI's raw output

        if (!mindmapStructureText) {
            alert("AI không thể tạo cấu trúc sơ đồ tư duy từ văn bản này. Vui lòng thử lại với nội dung khác hoặc định dạng rõ ràng hơn.");
            openAiResponseModal("Phản hồi AI trống", textContent, "AI không tạo ra cấu trúc sơ đồ tư duy. Vui lòng thử lại.");
            return;
        }

        // Tạo một sơ đồ tư duy mới trong Firestore
        const mindMapData = {
            userId: currentUser.uid,
            title: mapTitle,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp(),
            type: 'ai', // NEW: Add type for AI mind map
            canvasState: { scaleX: 1, scaleY: 1, x: 0, y: 0 }
        };
        const mindMapDocRef = await addDoc(collection(db, "mindmaps"), mindMapData);
        const newMindmapId = mindMapDocRef.id;

        const nodesToCreate = parseMindmapStructure(mindmapStructureText, newMindmapId);

        if (nodesToCreate.length === 0) {
            alert("AI đã tạo văn bản, nhưng không thể phân tích thành các nút. Vui lòng kiểm tra định dạng phản hồi của AI trong console.");
            openAiResponseModal("Lỗi phân tích sơ đồ AI", textContent, mindmapStructureText);
            return;
        }

        const batch = writeBatch(db);
        const nodeStyleBase = { ...DEFAULT_NODE_STYLE, width: 150, minHeight: 50, padding: 10, cornerRadius: 5 };

        // Map to store information about created nodes for positioning children
        const createdNodeMap = new Map(); // Map tempId to { actualFirestoreId, x, y, style }

        // Track last position for each level to prevent direct overlaps
        const lastNodePosPerLevel = {}; // { level: { x, y, width, height } }

        // Function to recursively calculate positions and add to batch
        const addNodeToBatch = (node, parentNodeInfo = null) => {
            const newNodeFirestoreId = doc(collection(db, "nodes")).id;

            let actualX, actualY;
            let nodeCalculatedStyle = { ...nodeStyleBase };

            const canvasWidth = konvaContainer?.clientWidth || 800;
            const canvasHeight = konvaContainer?.clientHeight || 600;

            if (node.level === 0) { // Root node
                actualX = canvasWidth / 2 - (nodeStyleBase.width / 2); // Center horizontally
                actualY = 50; // Start near top

                // If there's a previous root, stack below it
                const previousRoot = nodesToCreate.filter(n => n.level === 0 && nodesToCreate.indexOf(n) < nodesToCreate.indexOf(node)).pop();
                if (previousRoot && createdNodeMap.has(previousRoot.tempId)) {
                    const prevRootInfo = createdNodeMap.get(previousRoot.tempId);
                    actualY = prevRootInfo.y + prevRootInfo.style.minHeight + 80; // Stack below previous root
                }

                nodeCalculatedStyle = { ...nodeStyleBase, backgroundColor: "#1877f2", textColor: "#ffffff", borderColor: "#0e5aab", shape: "ellipse", minHeight: 60, fontSize: 16 };
            } else if (parentNodeInfo) {
                const horizontalOffset = 100; // Base horizontal offset from parent
                const verticalOffset = 70;   // Base vertical offset from parent

                // Simple fan-out: alternate left/right for direct children (level 1)
                // For deeper levels, just offset from parent.
                if (node.level === 1) {
                     // Position children of level 0 nodes in a fan-out
                    const siblings = nodesToCreate.filter(n => n.parentId === node.parentId);
                    const siblingIndex = siblings.findIndex(s => s.tempId === node.tempId);

                    const angleStep = (Math.PI * 0.8) / Math.max(1, siblings.length - 1); // Spread over 180 degrees
                    const baseAngle = -Math.PI * 0.4; // Start slightly left of vertical
                    const currentAngle = baseAngle + (siblingIndex * angleStep);

                    const radius = 200; // Distance from parent
                    actualX = parentNodeInfo.x + parentNodeInfo.style.width / 2 + radius * Math.cos(currentAngle) - nodeStyleBase.width / 2;
                    actualY = parentNodeInfo.y + parentNodeInfo.style.minHeight / 2 + radius * Math.sin(currentAngle) - nodeStyleBase.minHeight / 2;

                } else {
                    // For deeper levels, just place below and slightly right of parent
                    actualX = parentNodeInfo.x + 50;
                    actualY = parentNodeInfo.y + parentNodeInfo.style.minHeight + 60;

                    // To avoid direct overlap, check last node at this level
                    if (lastNodePosPerLevel[node.level]) {
                        const lastNodeInfo = lastNodePosPerLevel[node.level];
                        // If new node would overlap horizontally, move it to the right
                        if (actualX < lastNodeInfo.x + lastNodeInfo.width + 20 && actualY < lastNodeInfo.y + lastNodeInfo.height + 20) {
                            actualX = lastNodeInfo.x + lastNodeInfo.width + 50;
                        }
                    }
                }

                // Apply style based on level
                if (node.level === 1) {
                    nodeCalculatedStyle = { ...nodeStyleBase, backgroundColor: "#E3F2FD", textColor: "#0D47A1", borderColor: "#90CAF9", shape: "roundedRectangle", cornerRadius: 8, fontSize: 14 };
                } else if (node.level === 2) {
                    nodeCalculatedStyle = { ...nodeStyleBase, backgroundColor: "#F0F4C3", textColor: "#33691E", borderColor: "#C5E1A5", shape: "rectangle", cornerRadius: 5, fontSize: 13 };
                } else { // Deeper levels
                    nodeCalculatedStyle = { ...nodeStyleBase, backgroundColor: "#FBE9E7", textColor: "#BF360C", borderColor: "#FFAB91", shape: "rectangle", cornerRadius: 3, fontSize: 12 };
                }

            } else { // Fallback, should ideally not be hit for non-root nodes
                actualX = 100;
                actualY = 100;
                console.warn("Node without parent or level 0, using fallback position:", node);
            }

            // Ensure positions are not negative
            actualX = Math.max(10, actualX);
            actualY = Math.max(10, actualY);

            const nodeDataForFirestore = {
                mapId: newMindmapId,
                parentId: parentNodeInfo ? parentNodeInfo.actualFirestoreId : null,
                text: node.text,
                position: { x: actualX, y: actualY },
                style: nodeCalculatedStyle,
                createdAt: serverTimestamp()
            };

            const nodeRef = doc(db, "nodes", newNodeFirestoreId);
            batch.set(nodeRef, nodeDataForFirestore);

            // Store info for children positioning and collision avoidance
            createdNodeMap.set(node.tempId, {
                actualFirestoreId: newNodeFirestoreId,
                x: actualX,
                y: actualY,
                style: nodeCalculatedStyle,
                level: node.level
            });

            // Update last position for this level
            lastNodePosPerLevel[node.level] = {
                x: actualX,
                y: actualY,
                width: nodeCalculatedStyle.width,
                height: nodeCalculatedStyle.minHeight // Use minHeight for simple bounding box
            };

            console.log(`Node created: ${node.text} (Level: ${node.level}, Parent: ${node.parentId ? node.parentId.substring(0,5) : 'None'}) at (${actualX}, ${actualY})`); // DEBUG: Node creation info
        };

        // Recursively add nodes to batch, maintaining parent info
        const processNodesRecursively = (parentNodeTempId, parentNodeInfo) => {
            const children = nodesToCreate.filter(n => n.parentId === parentNodeTempId);
            // Sort children to ensure consistent layout
            children.sort((a, b) => nodesToCreate.indexOf(a) - nodesToCreate.indexOf(b)); // Sort by original order

            for (const child of children) {
                addNodeToBatch(child, parentNodeInfo);
                processNodesRecursively(child.tempId, createdNodeMap.get(child.tempId));
            }
        };

        // Start processing from root nodes
        const rootNodes = nodesToCreate.filter(n => n.level === 0);
        // Sort root nodes by their original order in the parsed text
        rootNodes.sort((a, b) => nodesToCreate.indexOf(a) - nodesToCreate.indexOf(b));

        for (const root of rootNodes) {
            addNodeToBatch(root, null); // Add root node (no parentInfo)
            processNodesRecursively(root.tempId, createdNodeMap.get(root.tempId)); // Process its children
        }

        await batch.commit();

        aiTextInput.value = ''; // Clear input
        aiMindmapTitleInput.value = ''; // Clear title input
        alert(`AI đã tạo sơ đồ tư duy "${mapTitle}" thành công!`);
        showCanvasView(newMindmapId, mapTitle); // Switch to canvas view
    } catch (error) {
        console.error("Error generating mind map from text with AI:", error);
        let userMessage = "Lỗi khi AI tạo sơ đồ từ văn bản: " + error.message;
        if (error.message?.includes("API key not valid")) { userMessage += "\nVui lòng kiểm tra lại thiết lập API Key trong Firebase Console cho Gemini API."; }
        else if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) { userMessage = "Bạn đã gửi quá nhiều yêu cầu tới AI hoặc đã hết hạn ngạch. Vui lòng thử lại sau ít phút."; }
        else if (error.message?.toLowerCase().includes("model not found")){ userMessage = "Model AI không được tìm thấy. Vui lòng kiểm tra lại tên model đã cấu hình.";}
        else if (error.message?.toLowerCase().includes("candidate.safetyRatings")){ userMessage = "Phản hồi từ AI bị chặn do vấn đề an toàn nội dung. Văn bản đầu vào có thể chứa từ khóa nhạy cảm.";}
        openAiResponseModal("Lỗi AI Tạo Sơ đồ", textContent, userMessage);
    } finally {
        hideLoadingIndicator();
    }
}


// --- TOOLBAR BUTTON ACTIONS & KEYBOARD SHORTCUTS & ZOOM ---
async function addChildNodeLogic(parentNode) {
    if (!parentNode || !currentMindMapId || !db) return;
    const parentShape = parentNode.findOne('.nodeShape');
    if (!parentShape) {
        console.error("addChildNodeLogic: Could not find '.nodeShape' in parentNode:", parentNode.id());
        alert("Lỗi: Không tìm thấy hình dạng của nút cha để thêm nút con.");
        return;
    }
    const parentWidth = parentShape.width();
    const parentHeight = parentShape.height();

    const defaultChildStyle = { ...DEFAULT_NODE_STYLE, backgroundColor: "#f9f9f9", textColor: "#333333", borderColor: "#cccccc", shape: "rectangle", cornerRadius: 3, icon: '' };
    const newNodeData = {
        mapId: currentMindMapId,
        parentId: parentNode.id(),
        text: "Nút con mới",
        position: { // Position below and slightly to the right of parent
            x: parentNode.x() + parentWidth / 4,
            y: parentNode.y() + parentHeight + 30
        },
        style: defaultChildStyle,
        createdAt: serverTimestamp()
    };
    try {
        await addDoc(collection(db, "nodes"), newNodeData);
        // Firestore onSnapshot will handle re-rendering
    }
    catch (e) {
        console.error("Error adding child node:", e);
        alert("Lỗi khi thêm nút con: " + e.message);
    }
}
function findAllDescendantNodeIds(parentNodeId, allNodes) {
    let descendantIds = [];
    const directChildren = allNodes.filter(node => node.parentId === parentNodeId);
    for (const child of directChildren) {
        descendantIds.push(child.id);
        descendantIds = descendantIds.concat(findAllDescendantNodeIds(child.id, allNodes)); // Recursively find children of children
    }
    return descendantIds;
}
async function deleteNodeLogic(nodeToDelete) {
    if (!nodeToDelete || !currentMindMapId || !db) return;
    const nodeId = nodeToDelete.id();
    const konvaTextNode = nodeToDelete.findOne('.nodeTextContent');
    const nodeText = konvaTextNode ? (nodeToDelete.getAttr('fullTextData') || "Nút không tên") : "Nút không tên"; // Use full text for confirm
    const nodeTextPreview = nodeText.substring(0,30) + (nodeText.length > 30 ? "..." : "");

    if (window.confirm(`Bạn có chắc muốn xóa nút "${nodeTextPreview}" và TẤT CẢ các nút con của nó không? Hành động này không thể hoàn tác.`)) {
        try {
            console.log(`Attempting to delete node: ${nodeId} (${nodeTextPreview})`); // Debug log
            const descendantIds = findAllDescendantNodeIds(nodeId, allNodesDataForCurrentMap);
            const allIdsToDelete = [nodeId, ...descendantIds];
            console.log("All nodes to delete:", allIdsToDelete); // Debug log

            const batch = writeBatch(db);
            allIdsToDelete.forEach(id => {
                batch.delete(doc(db, "nodes", id));
            });
            await batch.commit();
            console.log("Nodes deleted successfully from Firestore."); // Debug log

            // Reset selection if the deleted node or one of its descendants was selected
            if (selectedKonvaNode && allIdsToDelete.includes(selectedKonvaNode.id())) {
                selectedKonvaNode = null;
                if(nodeStylePanel) hideElement(nodeStylePanel);
            }
            if (rightClickedKonvaNode && allIdsToDelete.includes(rightClickedKonvaNode.id())) {
                rightClickedKonvaNode = null;
            }
            // Firestore onSnapshot will handle re-rendering
        } catch (e) {
            console.error("Error deleting node and descendants:", e);
            alert("Lỗi khi xóa nút: " + e.message);
        }
    }
}
function handleGlobalKeyDown(e) {
    if (isEditingText) return; // Prevent global key actions if a modal (like edit node) is active

    // If context menu is open, Escape should close it
    if (contextMenu && !contextMenu.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            hideContextMenu();
        }
        return; // Don't process other keys if context menu is open
    }

    // If no node is selected, only allow arrow keys for stage panning
    if (!selectedKonvaNode && !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Allow these keys even if no node is selected for other potential global shortcuts (none currently)
        if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') return;
    }

    const KEYBOARD_MOVE_STEP = 10; // Pixels to move node/stage per key press
    switch (e.key) {
        case 'Tab': // Add child to selected node
            if (selectedKonvaNode) {
                e.preventDefault(); // Prevent default tab behavior
                addChildNodeLogic(selectedKonvaNode);
            }
            break;
        case 'Enter': // Edit selected node
            if (selectedKonvaNode) {
                e.preventDefault();
                editTextOnKonvaNode(selectedKonvaNode); // UPDATED call to use modal
            }
            break;
        case 'Delete':
        case 'Backspace': // Delete selected node and its children
            if (selectedKonvaNode) {
                e.preventDefault();
                deleteNodeLogic(selectedKonvaNode);
            }
            break;
        case 'ArrowUp':
        case 'ArrowDown':
        case 'ArrowLeft':
        case 'ArrowRight':
            e.preventDefault(); // Prevent page scrolling
            if (selectedKonvaNode) { // Move selected node
                let newX = selectedKonvaNode.x();
                let newY = selectedKonvaNode.y();
                if (e.key === 'ArrowUp') newY -= KEYBOARD_MOVE_STEP;
                else if (e.key === 'ArrowDown') newY += KEYBOARD_MOVE_STEP;
                else if (e.key === 'ArrowLeft') newX -= KEYBOARD_MOVE_STEP;
                else if (e.key === 'ArrowRight') newX += KEYBOARD_MOVE_STEP;

                // NEW: Apply snap to grid for keyboard movement
                if (isSnapToGridEnabled) {
                    const snappedPos = snapToGrid({ x: newX, y: newY });
                    newX = snappedPos.x;
                    newY = snappedPos.y;
                }

                selectedKonvaNode.position({ x: newX, y: newY });
                currentKonvaLayer.batchDraw();
                // Debounce Firestore update or update on dragend equivalent for keyboard
                if (db) {
                    updateDoc(doc(db, "nodes", selectedKonvaNode.id()), { position: { x: newX, y: newY } })
                        .catch(err => console.error("Error updating node position via keyboard:", err));
                }
            } else if (currentKonvaStage) { // Pan the stage if no node is selected
                let stageX = currentKonvaStage.x();
                let stageY = currentKonvaStage.y();
                // Invert direction for intuitive panning
                if (e.key === 'ArrowUp') stageY += KEYBOARD_MOVE_STEP * 2; // Pan view up = move stage content down
                else if (e.key === 'ArrowDown') stageY -= KEYBOARD_MOVE_STEP * 2;
                else if (e.key === 'ArrowLeft') stageX += KEYBOARD_MOVE_STEP * 2;
                else if (e.key === 'ArrowRight') stageX -= KEYBOARD_MOVE_STEP * 2;
                currentKonvaStage.position({x: stageX, y: stageY });
                currentKonvaStage.batchDraw();
                saveCanvasState(); // Save new stage position
            }
            break;
    }
}

// --- MAIN SCRIPT EXECUTION AFTER DOM IS LOADED ---
window.addEventListener('DOMContentLoaded', () => {
    // Initialize Firebase services
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        // Initialize Firebase AI (Gemini)
        if (typeof getAI === 'function' && typeof GoogleAIBackend === 'function' && typeof getGenerativeModel === 'function') {
            ai = getAI(app, { backend: new GoogleAIBackend() }); // Using default backend
            generativeModel = getGenerativeModel(ai, { model: "gemini-1.5-flash-latest" }); // Specify your desired model
            // console.log("Firebase initialized successfully with AI Logic SDK!");
        } else {
            console.error("Firebase AI SDK components not found. AI features will be disabled.");
            alert("Lỗi: Không thể tải các thành phần AI của Firebase. Các tính năng AI sẽ bị vô hiệu hóa.");
        }
    } catch (error) {
        console.error("Firebase initialization error:", error);
        alert("Lỗi nghiêm trọng: Không thể khởi tạo Firebase hoặc AI SDK. Chi tiết: " + error.message + "\nHãy chắc chắn bạn đã thay thế các giá trị placeholder trong firebaseConfig bằng thông tin dự án Firebase của bạn.");
    }

    // Assign DOM elements
    nodeStylePanel = document.getElementById('node-style-panel');
    nodeShapeSelect = document.getElementById('node-shape-select');
    nodeFontFamilySelect = document.getElementById('node-font-family-select');
    nodeFontSizeInput = document.getElementById('node-font-size-input');
    nodeIconSelect = document.getElementById('node-icon-select');
    nodeBgColorInput = document.getElementById('node-bg-color');
    nodeTextColorInput = document.getElementById('node-text-color');
    nodeBorderColorInput = document.getElementById('node-border-color');
    nodeLineColorInput = document.getElementById('node-line-color');
    nodeLineDashSelect = document.getElementById('node-line-dash-select');
    nodeLineWidthInput = document.getElementById('node-line-width');

    contextMenu = document.getElementById('context-menu');
    ctxAddChildButton = document.getElementById('ctx-add-child');
    ctxEditTextButton = document.getElementById('ctx-edit-text');
    ctxViewFullContentButton = document.getElementById('ctx-view-full-content');
    ctxSuggestChildrenButton = document.getElementById('ctx-suggest-children');
    ctxExpandNodeButton = document.getElementById('ctx-expand-node');
    ctxGenerateExamplesButton = document.getElementById('ctx-generate-examples');
    ctxAskAiNodeButton = document.getElementById('ctx-ask-ai-node');
    ctxSummarizeBranchButton = document.getElementById('ctx-summarize-branch');
    ctxGenerateActionPlanButton = document.getElementById('ctx-generate-action-plan');
    ctxGenerateOutlineButton = document.getElementById('ctx-generate-outline');
    ctxOptimizeLayoutButton = document.getElementById('ctx-optimize-layout'); // Assign new button
    ctxDeleteNodeButton = document.getElementById('ctx-delete-node');

    aiLoadingIndicator = document.getElementById('ai-loading-indicator');
    aiResponseModalOverlay = document.getElementById('ai-response-modal-overlay');
    aiResponseModalTitle = document.getElementById('ai-response-modal-title');
    aiResponseModalBody = document.getElementById('ai-response-modal-body');
    aiResponseModalCloseButton = document.getElementById('ai-response-modal-close-button');

    nodeContentModalOverlay = document.getElementById('node-content-modal-overlay');
    nodeContentModalTitle = document.getElementById('node-content-modal-title');
    nodeContentModalBody = document.getElementById('node-content-modal-body');
    nodeContentModalCloseButton = document.getElementById('node-content-modal-close-button');

    editNodeTextModalOverlay = document.getElementById('edit-node-text-modal-overlay');
    editNodeTextModalTitle = document.getElementById('edit-node-text-modal-title');
    editNodeTextarea = document.getElementById('edit-node-textarea');
    editNodeTextModalSaveButton = document.getElementById('edit-node-text-modal-save-button');
    editNodeTextModalCancelButton = document.getElementById('edit-node-text-modal-cancel-button');
    editNodeTextModalCloseButton = document.getElementById('edit-node-text-modal-close-button');


    authSection = document.getElementById('auth-section');
    loginForm = document.getElementById('login-form');
    registerForm = document.getElementById('register-form');
    loginEmailInput = document.getElementById('login-email');
    loginPasswordInput = document.getElementById('login-password');
    loginButton = document.getElementById('login-button');
    showRegisterLink = document.getElementById('show-register-link');
    registerEmailInput = document.getElementById('register-email');
    registerPasswordInput = document.getElementById('register-password');
    registerButton = document.getElementById('register-button');
    showLoginLink = document.getElementById('show-login-link');
    loginErrorMsg = document.getElementById('login-error');
    registerErrorMsg = document.getElementById('register-error');


    mainAppSection = document.getElementById('main-app-section');
    mainAppTitle = document.getElementById('main-app-title');
    userEmailDisplay = document.getElementById('user-email-display');
    logoutButton = document.getElementById('logout-button');


    mindmapManagementView = document.getElementById('mindmap-management-view');
    newMindmapTitleInput = document.getElementById('new-mindmap-title-input');
    createMindmapButton = document.getElementById('create-mindmap-button');
    normalMindmapListUl = document.getElementById('normal-mindmap-list');
    normalMindmapListLoading = document.getElementById('normal-mindmap-list-loading');

    aiMindmapListUl = document.getElementById('ai-mindmap-list');
    aiMindmapListLoading = document.getElementById('ai-mindmap-list-loading');


    canvasView = document.getElementById('canvas-view');
    backToMapsListButton = document.getElementById('back-to-maps-list-button');
    currentMindmapTitleDisplay = document.getElementById('current-mindmap-title-display');
    addChildNodeButton = document.getElementById('add-child-node-button');
    deleteNodeButton = document.getElementById('delete-node-button');
    zoomInButton = document.getElementById('zoom-in-button');
    zoomOutButton = document.getElementById('zoom-out-button');
    resetZoomButton = document.getElementById('reset-zoom-button');
    konvaContainer = document.getElementById('konva-container');
    konvaContainerLoading = document.getElementById('konva-container-loading');

    aiTextInput = document.getElementById('ai-text-input');
    generateMindmapFromTextButton = document.getElementById('generate-mindmap-from-text-button');
    aiMindmapTitleInput = document.getElementById('ai-mindmap-title-input');

    toggleGridCheckbox = document.getElementById('toggle-grid');
    toggleSnapToGridCheckbox = document.getElementById('toggle-snap-to-grid');
    gridSizeInput = document.getElementById('grid-size-input');


    // Setup event listeners
    if (aiResponseModalCloseButton) { aiResponseModalCloseButton.addEventListener('click', closeAiResponseModal); }
    if (aiResponseModalOverlay) { aiResponseModalOverlay.addEventListener('click', function(event) { if (event.target === aiResponseModalOverlay) closeAiResponseModal(); }); }
    if (nodeContentModalCloseButton) { nodeContentModalCloseButton.addEventListener('click', closeNodeContentModal); }
    if (nodeContentModalOverlay) { nodeContentModalOverlay.addEventListener('click', function(event) { if (event.target === nodeContentModalOverlay) closeNodeContentModal(); });}

    if (editNodeTextModalSaveButton) { editNodeTextModalSaveButton.addEventListener('click', handleSaveNodeTextFromModal); }
    if (editNodeTextModalCancelButton) { editNodeTextModalCancelButton.addEventListener('click', closeEditNodeModal); }
    if (editNodeTextModalCloseButton) { editNodeTextModalCloseButton.addEventListener('click', closeEditNodeModal); }
    if (editNodeTextarea) {
        editNodeTextarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                handleSaveNodeTextFromModal();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeEditNodeModal();
            }
        });
    }


    if (showRegisterLink) { showRegisterLink.addEventListener('click', (e) => { e.preventDefault(); hideElement(loginForm); showElement(registerForm); clearAuthError(loginErrorMsg); }); }
    if (showLoginLink) { showLoginLink.addEventListener('click', (e) => { e.preventDefault(); hideElement(registerForm); showElement(loginForm); clearAuthError(registerErrorMsg); }); }
    if (registerButton) { registerButton.addEventListener('click', handleRegister); }
    if (loginButton) { loginButton.addEventListener('click', handleLogin); }
    if (logoutButton) { logoutButton.addEventListener('click', handleLogout); }

    if (auth) { onAuthStateChanged(auth, authStateChangedHandler); }

    if (backToMapsListButton) { backToMapsListButton.addEventListener('click', showMindmapManagementView); }

    if (nodeShapeSelect) nodeShapeSelect.addEventListener('change', (e) => handleNodeStyleChange('shape', e.target.value));
    if (nodeFontFamilySelect) nodeFontFamilySelect.addEventListener('change', (e) => handleNodeStyleChange('fontFamily', e.target.value));
    if (nodeFontSizeInput) nodeFontSizeInput.addEventListener('input', (e) => handleNodeStyleChange('fontSize', e.target.value));
    if (nodeIconSelect) nodeIconSelect.addEventListener('change', (e) => handleNodeStyleChange('icon', e.target.value));
    if (nodeBgColorInput) nodeBgColorInput.addEventListener('input', (e) => handleNodeStyleChange('backgroundColor', e.target.value));
    if (nodeTextColorInput) nodeTextColorInput.addEventListener('input', (e) => handleNodeStyleChange('textColor', e.target.value));
    if (nodeBorderColorInput) nodeBorderColorInput.addEventListener('input', (e) => handleNodeStyleChange('borderColor', e.target.value));
    if (nodeLineColorInput) nodeLineColorInput.addEventListener('input', (e) => handleNodeStyleChange('lineColor', e.target.value));
    if (nodeLineDashSelect) nodeLineDashSelect.addEventListener('change', (e) => handleNodeStyleChange('lineDash', e.target.value));
    if (nodeLineWidthInput) nodeLineWidthInput.addEventListener('input', (e) => handleNodeStyleChange('lineWidth', e.target.value));


    if (createMindmapButton) { createMindmapButton.addEventListener('click', handleCreateMindmap); }

    if (generateMindmapFromTextButton) {
        generateMindmapFromTextButton.addEventListener('click', handleGenerateMindmapFromText);
    }

    if (toggleGridCheckbox) {
        toggleGridCheckbox.addEventListener('change', (e) => {
            isGridVisible = e.target.checked;
            updateGrid();
            saveCanvasState();
        });
    }
    if (toggleSnapToGridCheckbox) {
        toggleSnapToGridCheckbox.addEventListener('change', (e) => {
            isSnapToGridEnabled = e.target.checked;
            saveCanvasState();
        });
    }
    if (gridSizeInput) {
        gridSizeInput.addEventListener('input', (e) => {
            gridSize = parseInt(e.target.value, 10);
            if (isNaN(gridSize) || gridSize < 10) gridSize = 10;
            if (isGridVisible) updateGrid();
            saveCanvasState();
        });
    }


    // Context Menu item listeners
    if (ctxAddChildButton) {
        ctxAddChildButton.addEventListener('click', async () => {
            let targetNode = rightClickedKonvaNode || selectedKonvaNode;
            if (!targetNode || !currentMindMapId || !db) {
                alert("Không thể thêm nút con. Vui lòng thử lại.");
                hideContextMenu(); return;
            }
            await addChildNodeLogic(targetNode);
            hideContextMenu();
        });
    }
    if (ctxEditTextButton) {
        ctxEditTextButton.addEventListener('click', () => {
            let targetNode = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNode) {
                editTextOnKonvaNode(targetNode);
            }
            hideContextMenu();
        });
    }
    if (ctxViewFullContentButton) {
        ctxViewFullContentButton.addEventListener('click', () => {
            const targetNode = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNode) {
                const fullText = targetNode.getAttr('fullTextData');
                if (fullText) { openNodeContentModal(fullText.substring(0,30)+"...", fullText); }
                else { alert("Không có nội dung đầy đủ để hiển thị."); }
            } else { alert("Vui lòng chọn một nút để xem nội dung."); }
            hideContextMenu();
        });
    }
    if (ctxSuggestChildrenButton) {
        ctxSuggestChildrenButton.addEventListener('click', async () => {
            let targetNodeForAI = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNodeForAI) { await suggestChildNodesWithAI(targetNodeForAI); }
            else { alert("Vui lòng chọn một nút cha để AI gợi ý nút con."); hideContextMenu(); }
        });
    }
    if (ctxExpandNodeButton) {
        ctxExpandNodeButton.addEventListener('click', async () => {
            let targetNodeForAI = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNodeForAI) { await expandNodeWithAI(targetNodeForAI); }
            else { alert("Vui lòng chọn một nút để AI mở rộng ý tưởng."); hideContextMenu(); }
        });
    }
    if (ctxGenerateExamplesButton) {
        ctxGenerateExamplesButton.addEventListener('click', async () => {
            let targetNodeForAI = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNodeForAI) { await generateExamplesWithAI(targetNodeForAI); }
            else { alert("Vui lòng chọn một nút để AI tạo ví dụ."); hideContextMenu(); }
        });
    }
    if (ctxAskAiNodeButton) {
        ctxAskAiNodeButton.addEventListener('click', async () => {
            let targetNodeForAI = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNodeForAI) { await askAIAboutNode(targetNodeForAI); }
            else { alert("Vui lòng chọn một nút để đặt câu hỏi cho AI."); hideContextMenu(); }
        });
    }
    if (ctxSummarizeBranchButton) {
        ctxSummarizeBranchButton.addEventListener('click', async () => {
            let targetNodeForSummarize = rightClickedKonvaNode || selectedKonvaNode;
            if (targetNodeForSummarize) { await summarizeBranchWithAI(targetNodeForSummarize); }
            else { alert("Vui lòng chọn một nút gốc của nhánh để AI tóm tắt."); hideContextMenu(); }
        });
    }
    if (ctxGenerateActionPlanButton) {
        ctxGenerateActionPlanButton.addEventListener('click', async () => {
            let targetNodeForPlan = rightClickedKonvaNode || selectedKonvaNode;
            if (!targetNodeForPlan) {
                alert("Vui lòng chọn một nút để AI tạo kế hoạch hành động.");
                hideContextMenu();
                return;
            }
            await generateActionPlanWithAI(targetNodeForPlan);
            hideContextMenu();
        });
    }
    if (ctxGenerateOutlineButton) {
        console.log("Assigning click listener to ctxGenerateOutlineButton.");
        ctxGenerateOutlineButton.addEventListener('click', async () => {
            console.log("ctxGenerateOutlineButton clicked.");
            let targetNodeForOutline = rightClickedKonvaNode || selectedKonvaNode;
            if (!targetNodeForOutline) {
                alert("Vui lòng chọn một nút để AI tạo dàn ý.");
                hideContextMenu();
                return;
            }
            await generateOutlineWithAI(targetNodeForOutline);
            hideContextMenu();
        });
    }
    if (ctxOptimizeLayoutButton) {
        console.log("Assigning click listener to ctxOptimizeLayoutButton.");
        ctxOptimizeLayoutButton.addEventListener('click', async () => {
            console.log("ctxOptimizeLayoutButton clicked.");
            let targetNodeForLayout = rightClickedKonvaNode || selectedKonvaNode;
            // If no node is selected, optimize the entire map. Otherwise, optimize the branch.
            await optimizeLayoutWithAI(targetNodeForLayout ? targetNodeForLayout.id() : null);
            hideContextMenu();
        });
    }
    if (ctxDeleteNodeButton) {
        ctxDeleteNodeButton.addEventListener('click', async () => {
            console.log("Delete Node button clicked in context menu.");
            let targetNode = rightClickedKonvaNode || selectedKonvaNode;
            if (!targetNode || !currentMindMapId || !db) {
                 alert("Không thể xóa nút. Vui lòng thử lại."); hideContextMenu(); return;
            }
            await deleteNodeLogic(targetNode);
            hideContextMenu();
        });
    }


    // Global click listener to hide context menu if clicked outside
    document.addEventListener('click', function (e) {
        if (contextMenu && !contextMenu.classList.contains('hidden')) {
            if (!contextMenu.contains(e.target) && e.target !== currentKonvaStage && !e.target.hasName?.('mindmapNodeGroup') && !e.target.getParent?.()?.hasName?.('mindmapNodeGroup')) {
                 hideContextMenu();
            }
        }
    });

    // Toolbar button listeners
     if (addChildNodeButton) {
        addChildNodeButton.addEventListener('click', async () => {
            if (!selectedKonvaNode) { alert("Vui lòng chọn một nút cha để thêm nút con."); return; }
            await addChildNodeLogic(selectedKonvaNode);
        });
    }
    if (deleteNodeButton) {
        deleteNodeButton.addEventListener('click', async () => {
            if (!selectedKonvaNode) { alert("Vui lòng chọn một nút để xóa."); return; }
            await deleteNodeLogic(selectedKonvaNode);
        });
    }
    if(zoomInButton) { zoomInButton.addEventListener('click', () => { if (!currentKonvaStage) return; const oldScale = currentKonvaStage.scaleX(); currentKonvaStage.scale({ x: oldScale * scaleBy, y: oldScale * scaleBy }); currentKonvaStage.batchDraw(); saveCanvasState(); }); }
    if(zoomOutButton) { zoomOutButton.addEventListener('click', () => { if (!currentKonvaStage) return; const oldScale = currentKonvaStage.scaleX(); currentKonvaStage.scale({ x: oldScale / scaleBy, y: oldScale / scaleBy }); currentKonvaStage.batchDraw(); saveCanvasState(); }); }
    if(resetZoomButton) { resetZoomButton.addEventListener('click', () => { if (!currentKonvaStage) return; currentKonvaStage.scale({ x: 1, y: 1 }); currentKonvaStage.position({ x: 0, y: 0 }); currentKonvaStage.batchDraw(); saveCanvasState(); }); }


    // Resize Konva stage when window resizes
    window.addEventListener('resize', () => {
        if (currentKonvaStage && konvaContainer && konvaContainer.offsetParent !== null) { // Check if canvas is visible
            const newWidth = konvaContainer.clientWidth;
            const newHeight = konvaContainer.clientHeight;
            currentKonvaStage.width(newWidth);
            currentKonvaStage.height(newHeight);
            updateGrid(); // Redraw grid on resize
        }
    });

}); // End of DOMContentLoaded
