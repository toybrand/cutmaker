import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Helper Functions ---
const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

const App = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [renderTrigger, setRenderTrigger] = useState(0);
    const [apiKeySelected, setApiKeySelected] = useState(false);
    const userApiKey = useRef<string | null>(null);

    const imageSources = useRef({
        subject: [null],
        scene: [null],
        style: [null],
        characters: [null],
        background: [null],
    });

    const history = useRef<string[]>([]);
    const historyIndex = useRef(-1);

    // Refs for annotation modal
    const annotationCanvasRef = useRef<HTMLCanvasElement>(null);
    const annotationHistory = useRef<ImageData[]>([]);
    const annotationHistoryIndex = useRef(-1);
    const isDrawing = useRef(false);
    const activeAnnotationTool = useRef('brush');
    const brushColor = useRef('#ffeb3b');
    const brushSize = useRef(5);
    const textSize = useRef(20);
    const annotationOriginalImage = useRef<HTMLImageElement | null>(null);
    const annotationTextElements = useRef({});
    const selectedTextId = useRef(null);
    const textIdCounter = useRef(0);

    // Refs for edit panel
    const editorCanvasRef = useRef<HTMLCanvasElement>(null);
    const editHistory = useRef<ImageData[]>([]);
    const editHistoryIndex = useRef(-1);
    const isEditDrawing = useRef(false);
    const editBrushSize = useRef(20);
    const isEditModeActive = useRef(false);

    // Refs for crop panel
    const isCropModeActive = useRef(false);
    const cropState = useRef({ x: 0, y: 0, width: 100, height: 100 });
    const activeAspectRatio = useRef<string | null>(null);
    const dragInfo = useRef({
        active: false,
        type: '', // 'move' or 'resize'
        handle: '', // e.g., 'top-left'
        startX: 0,
        startY: 0,
        startBox: { x: 0, y: 0, width: 0, height: 0 },
    });

    useEffect(() => {
        // --- Translation Data ---
        const translations = {
            'header.title': { ko: '이미지 생성기', en: 'Image Generator', ja: '画像ジェネレーター' },
            'tool.generate': { ko: 'AI로 새로운 이미지를 생성합니다.', en: 'Generate new images with AI.', ja: 'AIで新しい画像を生成します。' },
            'tool.compose': { ko: '캐릭터와 배경을 합성하여 장면을 연출합니다.', en: 'Compose a scene by combining characters and backgrounds.', ja: 'キャラクターと背景を合成してシーンを演出します。' },
            'tool.edit': { ko: '브러시로 영역을 지정하고 프롬프트로 이미지를 수정합니다.', en: 'Select an area with the brush and modify the image with a prompt.', ja: 'ブラシで領域を選択し、プロンプトで画像を修正します。' },
            'tool.crop': { ko: '이미지를 자르거나 화질을 개선합니다.', en: 'Crop the image or improve its quality.', ja: '画像を切り抜いたり、画質を改善したりします。' },
            'tool.camera': { ko: '카메라 각도, 방향, 렌즈를 조절하여 이미지를 다시 렌더링합니다.', en: 'Adjust camera angle, direction, and lens to re-render the image.', ja: 'カメラの角度、方向、レンズを調整して画像を再レンダリングします。' },
            'tool.light': { ko: '장면에 조명을 추가하여 분위기를 바꿉니다.', en: 'Add lighting to the scene to change the mood.', ja: 'シーンに照明を追加して雰囲気を変えます。' },
            'panel.generate.subject': { ko: '피사체', en: 'Subject', ja: '被写体' },
            'common.deleteAll': { ko: '이 섹션의 모든 이미지를 삭제합니다.', en: 'Delete all images in this section.', ja: 'このセクションのすべての画像を削除します。' },
            'common.addSlot': { ko: '이미지를 추가할 새 슬롯을 만듭니다.', en: 'Create a new slot to add an image.', ja: '画像を追加するための新しいスロットを作成します。' },
            'common.deleteImage': { ko: '이 이미지를 삭제합니다.', en: 'Delete this image.', ja: 'この画像を削除します。' },
            'dropzone.prompt': { ko: '이미지 드롭 또는 클릭', en: 'Drop image or click', ja: '画像をドロップまたはクリック' },
            'panel.generate.scene': { ko: '장면', en: 'Scene', ja: 'シーン' },
            'panel.generate.style': { ko: '스타일', en: 'Style', ja: 'スタイル' },
            'panel.generate.prompt.placeholder': { ko: '생성하고 싶은 이미지에 대한 설명을 입력하세요...', en: 'Enter a description of the image you want to create...', ja: '作成したい画像の説明を入力してください...' },
            'panel.generate.button': { ko: '생성하기', en: 'Generate', ja: '生成する' },
            'sidebar.actions.reset': { ko: '이미지 리셋', en: 'Image Reset', ja: '画像リセット' },
            'sidebar.actions.delete': { ko: '이미지 삭제', en: 'Image Delete', ja: '画像削除' },
            'panel.compose.characters': { ko: '등장인물', en: 'Characters', ja: '登場人物' },
            'panel.compose.background': { ko: '배경', en: 'Background', ja: '背景' },
            'panel.compose.editScene': { ko: '연출 편집', en: 'Edit Scene', ja: '演出編集' },
            'panel.generate.aspectRatioHint': { ko: '종횡비 힌트', en: 'Aspect Ratio Hint', ja: 'アスペクト比のヒント' },
            'panel.generate.aspect.auto': { ko: '자동', en: 'Auto', ja: '自動' },
            'panel.compose.prompt.placeholder': { ko: '장면 합성에 대한 추가 지시사항...', en: 'Additional instructions for scene composition...', ja: 'シーン合成に関する追加の指示...' },
            'panel.compose.button': { ko: '장면생성', en: 'Compose Scene', ja: 'シーン生成' },
            'panel.edit.image': { ko: '편집할 이미지', en: 'Image to Edit', ja: '編集する画像' },
            'panel.edit.brush': { ko: '브러시', en: 'Brush', ja: 'ブラシ' },
            'panel.edit.brush.size': { ko: '크기', en: 'Size', ja: 'サイズ' },
            'panel.edit.brush.undo': { ko: '실행 취소', en: 'Undo', ja: '元に戻す' },
            'panel.edit.brush.clearMask': { ko: '마스크 지우기', en: 'Clear Mask', ja: 'マスクを消去' },
            'panel.edit.prompt.placeholder': { ko: '이미지의 선택된 영역을 어떻게 수정할까요?', en: 'How should the selected area of the image be modified?', ja: '画像の選択した領域をどのように修正しますか？' },
            'panel.edit.button': { ko: '수정 적용하기', en: 'Apply Edit', ja: '修正を適用' },
            'panel.crop.image': { ko: '자를 이미지', en: 'Image to Crop', ja: '切り抜く画像' },
            'panel.crop.aspectRatio': { ko: '종횡비', en: 'Aspect Ratio', ja: 'アスペクト比' },
            'panel.crop.button.crop': { ko: '1. 이미지 자르기', en: '1. Crop Image', ja: '1. 画像を切り抜く' },
            'panel.crop.button.upscale': { ko: '2. 화질 개선 및 리프레임', en: '2. Upscale & Reframe', ja: '2. 画質改善とリフレーム' },
            'panel.camera.image': { ko: '카메라 이미지', en: 'Camera Image', ja: 'カメラ画像' },
            'panel.camera.title': { ko: '카메라 큐브', en: 'Camera Cube', ja: 'カメラキューブ' },
            'panel.camera.tooltip': { ko: '큐브를 직접 드래그하거나 아래 슬라이더를 사용하여 카메라 위치를 조정할 수 있습니다. 이미지를 업로드하고 생성하기를 누르세요.', en: 'You can drag the cube directly or use the sliders below to adjust the camera position. Upload an image and press Generate.', ja: 'キューブを直接ドラッグするか、下のスライダーを使用してカメラの位置を調整できます。画像をアップロードして「生成」を押してください。' },
            'panel.camera.invert': { ko: '조종방향 반전', en: 'Invert Controls', ja: '操作方向を反転' },
            'panel.camera.caption': { ko: '모든 샷은 FRONT를 기준으로 위치를 조정합니다.', en: 'All shots adjust their position based on the FRONT.', ja: 'すべてのショットはFRONTを基準に位置を調整します。' },
            'panel.camera.vertical': { ko: '상하', en: 'Vertical', ja: '上下' },
            'camera.term.vertical.highAngle': { ko: '하이 앵글', en: 'High Angle', ja: 'ハイアングル' },
            'camera.term.vertical.slightlyHigh': { ko: '부감', en: 'Slightly High', ja: '俯瞰' },
            'camera.term.vertical.eyeLevel': { ko: '정면', en: 'Eye-Level', ja: '正面' },
            'camera.term.vertical.slightlyLow': { ko: '앙각', en: 'Slightly Low', ja: '仰角' },
            'camera.term.vertical.lowAngle': { ko: '로우 앵글', en: 'Low Angle', ja: 'ローアングル' },
            'panel.camera.direction': { ko: '방향', en: 'Direction', ja: '方向' },
            'camera.term.horizontal.front': { ko: '정면', en: 'Front', ja: '正面' },
            'camera.term.horizontal.leftFront': { ko: '좌측 정면', en: 'Left-Front', ja: '左正面' },
            'camera.term.horizontal.left': { ko: '좌측면', en: 'Left Side', ja: '左側面' },
            'camera.term.horizontal.leftBack': { ko: '좌측 후면', en: 'Left-Back', ja: '左後方' },
            'camera.term.horizontal.back': { ko: '후면', en: 'Back', ja: '背面' },
            'camera.term.horizontal.rightBack': { ko: '우측 후면', en: 'Right-Back', ja: '右後方' },
            'camera.term.horizontal.right': { ko: '우측면', en: 'Right Side', ja: '右側面' },
            'camera.term.horizontal.rightFront': { ko: '우측 정면', en: 'Right-Front', ja: '右正面' },
            'panel.camera.lens': { ko: '렌즈', en: 'Lens', ja: 'レンズ' },
            'panel.camera.history.title': { ko: '최근 생성된 이미지', en: 'Recently Generated Images', ja: '最近生成された画像' },
            'panel.camera.history.clear': { ko: '생성 기록을 모두 지웁니다.', en: 'Clear all generation history.', ja: '生成履歴をすべて消去します。' },
            'panel.camera.button.generate': { ko: '생성하기', en: 'Generate', ja: '生成する' },
            'panel.camera.button.resetCamera': { ko: '카메라 초기화', en: 'Reset Camera', ja: 'カメラをリセット' },
            'panel.camera.button.resetImage': { ko: '이미지 리셋', en: 'Image Reset', ja: '画像リセット' },
            'panel.light.presets': { ko: '프리셋', en: 'Presets', ja: 'プリセット' },
            'panel.light.presets.daylight': { ko: '자연광', en: 'Daylight', ja: '自然光' },
            'panel.light.presets.goldenHour': { ko: '골든 아워', en: 'Golden Hour', ja: 'ゴールデンアワー' },
            'panel.light.presets.studio': { ko: '스튜디오', en: 'Studio', ja: 'スタジオ' },
            'panel.light.presets.rim': { ko: '역광', en: 'Rim Light', ja: '逆光' },
            'panel.light.presets.horror': { ko: '호러', en: 'Horror', ja: 'ホラー' },
            'panel.light.presets.mono': { ko: '모노', en: 'Mono', ja: 'モノ' },
            'panel.light.presets.fantasy': { ko: '판타지', en: 'Fantasy', ja: 'ファンタジー' },
            'panel.light.presets.cinematic': { ko: '시네마틱', en: 'Cinematic', ja: 'シネマティック' },
            'panel.light.controls.type': { ko: '종류', en: 'Type', ja: '種類' },
            'panel.light.controls.type.point': { ko: '점', en: 'Point', ja: '点' },
            'panel.light.controls.type.directional': { ko: '방향', en: 'Directional', ja: '指向性' },
            'panel.light.controls.type.spot': { ko: '스팟', en: 'Spot', ja: 'スポット' },
            'panel.light.controls.type.ambient': { ko: '환경', en: 'Ambient', ja: '環境' },
            'panel.light.controls.intensity': { ko: '강도', en: 'Intensity', ja: '強度' },
            'panel.light.controls.temperature': { ko: '색온도', en: 'Temperature', ja: '色温度' },
            'panel.light.controls.hardness': { ko: '경도', en: 'Hardness', ja: '硬度' },
            'panel.light.controls.color': { ko: '색상', en: 'Color', ja: '色' },
            'panel.light.button.resetLight': { ko: '조명 초기화', en: 'Reset Light', ja: '照明リセット' },
            'main.controls.undo': { ko: '마지막 작업 되돌리기 (Ctrl+Z)', en: 'Undo last action (Ctrl+Z)', ja: '最後の操作を取り消す (Ctrl+Z)' },
            'main.controls.redo': { ko: '되돌린 작업 다시 실행 (Ctrl+Y)', en: 'Redo undone action (Ctrl+Y)', ja: '取り消した操作をやり直す (Ctrl+Y)' },
            'main.controls.download': { ko: '현재 이미지를 파일로 다운로드합니다.', en: 'Download the current image as a file.', ja: '現在の画像をファイルとしてダウンロードします。' },
            'placeholder.generate': { ko: '좌측 패널에서 이미지를 생성하여 작업을 시작하세요.', en: 'Start by generating an image from the left panel.', ja: '左のパネルで画像を生成して作業を開始してください。' },
            'loader.generating': { ko: '이미지를 생성 중입니다...', en: 'Generating image...', ja: '画像を生成中です...' },
            'comparison.before': { ko: '원본', en: 'Original', ja: 'オリジナル' },
            'comparison.after': { ko: '개선됨', en: 'Improved', ja: '改善済み' },
            'common.close': { ko: '닫기', en: 'Close', ja: '閉じる' },
            'modal.annotation.brush': { ko: '브러시: 배경에 그림을 그려 연출을 돕습니다.', en: 'Brush: Draw on the background to guide the composition.', ja: 'ブラシ：背景に描画して演出を補助します。' },
            'modal.annotation.eraser': { ko: '지우개: 그린 내용을 지웁니다.', en: 'Eraser: Erase what you have drawn.', ja: '消しゴム：描いた内容を消去します。' },
            'modal.annotation.text': { ko: '텍스트: 번호나 지시사항을 추가합니다.', en: 'Text: Add numbers or instructions.', ja: 'テキスト：番号や指示を追加します。' },
            'modal.annotation.save': { ko: '저장하고 닫기', en: 'Save and Close', ja: '保存して閉じる' },
        };

        // --- Language Switcher ---
        const setLanguage = (lang: 'ko' | 'en' | 'ja') => {
            document.documentElement.lang = lang;
            localStorage.setItem('cutmaker_lang', lang);
            
            document.querySelectorAll('[data-translate-key]').forEach(el => {
                const key = el.getAttribute('data-translate-key');
                if (key && translations[key] && translations[key][lang]) {
                    el.textContent = translations[key][lang];
                }
            });

            document.querySelectorAll('[data-translate-key-placeholder]').forEach(el => {
                const key = el.getAttribute('data-translate-key-placeholder');
                if (key && translations[key] && translations[key][lang]) {
                    (el as HTMLInputElement | HTMLTextAreaElement).placeholder = translations[key][lang];
                }
            });

            document.querySelectorAll('[data-translate-key-title]').forEach(el => {
                const key = el.getAttribute('data-translate-key-title');
                if (key && translations[key] && translations[key][lang]) {
                    el.setAttribute('title', translations[key][lang]);
                }
            });

            // Special case for camera sliders that use keys
            const verticalSlider = document.getElementById('vertical-slider') as HTMLInputElement;
            if (verticalSlider) updateCameraSliderText(verticalSlider, document.getElementById('vertical-slider-value'));
            const horizontalSlider = document.getElementById('horizontal-slider') as HTMLInputElement;
            if (horizontalSlider) updateCameraSliderText(horizontalSlider, document.getElementById('horizontal-slider-value'));
        };

        const updateCameraSliderText = (slider: HTMLInputElement, valueEl: HTMLElement) => {
            if (!slider || !valueEl) return;
            const value = parseInt(slider.value);
            const currentLang = (localStorage.getItem('cutmaker_lang') || 'ko') as 'ko' | 'en' | 'ja';
            let key = '';
            
            switch (slider.id) {
                case 'vertical-slider':
                    if (value > 60) key = 'camera.term.vertical.highAngle';
                    else if (value > 20) key = 'camera.term.vertical.slightlyHigh';
                    else if (value > -20) key = 'camera.term.vertical.eyeLevel';
                    else if (value > -60) key = 'camera.term.vertical.slightlyLow';
                    else key = 'camera.term.vertical.lowAngle';
                    break;
                case 'horizontal-slider':
                    const angle = value;
                    if (angle > -22.5 && angle <= 22.5) key = 'camera.term.horizontal.front';
                    else if (angle > 22.5 && angle <= 67.5) key = 'camera.term.horizontal.leftFront';
                    else if (angle > 67.5 && angle <= 112.5) key = 'camera.term.horizontal.left';
                    else if (angle > 112.5 && angle <= 157.5) key = 'camera.term.horizontal.leftBack';
                    else if (angle > 157.5 || angle <= -157.5) key = 'camera.term.horizontal.back';
                    else if (angle > -157.5 && angle <= -112.5) key = 'camera.term.horizontal.rightBack';
                    else if (angle > -112.5 && angle <= -67.5) key = 'camera.term.horizontal.right';
                    else key = 'camera.term.horizontal.rightFront';
                    break;
                case 'lens-slider':
                     valueEl.textContent = `${value}mm`;
                     return;
            }
            if (key && translations[key] && translations[key][currentLang]) {
                valueEl.textContent = translations[key][currentLang];
            }
        };

        const setupLanguageSwitcher = () => {
            const dropdown = document.getElementById('language-dropdown');
            const currentLangBtn = document.getElementById('current-lang-btn');
            const currentLangText = document.getElementById('current-lang-text');
            const optionsContainer = document.getElementById('language-options');
        
            currentLangBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                optionsContainer.classList.toggle('hidden');
            });
        
            optionsContainer.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const btn = target.closest('.lang-option-btn') as HTMLButtonElement;
                if (btn) {
                    const lang = btn.dataset.lang as 'ko' | 'en' | 'ja';
                    setLanguage(lang);
                    currentLangText.textContent = lang.toUpperCase();
                    optionsContainer.classList.add('hidden');
                }
            });
        
            document.addEventListener('click', () => {
                if (!optionsContainer.classList.contains('hidden')) {
                    optionsContainer.classList.add('hidden');
                }
            });
        
            // Initial load
            const savedLang = (localStorage.getItem('cutmaker_lang') || 'ko') as 'ko' | 'en' | 'ja';
            currentLangText.textContent = savedLang.toUpperCase();
            setLanguage(savedLang);
        };
        
        // FIX: Reordered function definitions to prevent runtime errors due to function expressions not being hoisted.
        // --- Crop Mode Helpers ---
        const updateCropBoxElement = () => {
            const cropBox = document.getElementById('crop-box') as HTMLDivElement;
            if (!cropBox) return;
            requestAnimationFrame(() => {
                cropBox.style.left = `${cropState.current.x}px`;
                cropBox.style.top = `${cropState.current.y}px`;
                cropBox.style.width = `${cropState.current.width}px`;
                cropBox.style.height = `${cropState.current.height}px`;
            });
        };
        
        const applyAspectRatio = () => {
            if (!activeAspectRatio.current || !isCropModeActive.current) return;
        
            const [w, h] = activeAspectRatio.current.split(':').map(Number);
            const ratio = w / h;
        
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            const imageRect = mainImage.getBoundingClientRect();
        
            let newWidth, newHeight;
            const imageRatio = imageRect.width / imageRect.height;
            
            if (ratio > imageRatio) {
                newWidth = imageRect.width * 0.95;
                newHeight = newWidth / ratio;
            } else {
                newHeight = imageRect.height * 0.95;
                newWidth = newHeight * ratio;
            }
            
            const wrapperRect = (document.getElementById('image-wrapper') as HTMLElement).getBoundingClientRect();
            const centerX = (imageRect.left - wrapperRect.left) + imageRect.width / 2;
            const centerY = (imageRect.top - wrapperRect.top) + imageRect.height / 2;
        
            cropState.current = {
                width: newWidth,
                height: newHeight,
                x: centerX - newWidth / 2,
                y: centerY - newHeight / 2,
            };
            updateCropBoxElement();
        };

        const activateCropMode = () => {
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            const cropBox = document.getElementById('crop-box') as HTMLDivElement;
        
            isCropModeActive.current = true; // Set mode immediately
        
            const setup = () => {
                if (!isCropModeActive.current) return; // Check if still in crop mode when onload fires
        
                cropBox.classList.remove('hidden');
        
                // Set button states for step 1: cropping is active, upscale is not.
                (document.getElementById('crop-image-btn') as HTMLButtonElement).disabled = false;
                (document.getElementById('upscale-image-btn') as HTMLButtonElement).disabled = true;
        
                // Default to 16:9 aspect ratio for a better starting experience.
                document.querySelectorAll('#crop-panel .aspect-btn.active').forEach(b => b.classList.remove('active'));
                const sixteenNineBtn = document.querySelector('#crop-panel .aspect-btn[data-ratio="16:9"]') as HTMLButtonElement;
                if (sixteenNineBtn) {
                    sixteenNineBtn.classList.add('active');
                }
                activeAspectRatio.current = '16:9';
                applyAspectRatio();
            };
        
            if (!mainImage || !mainImage.src || mainImage.classList.contains('hidden')) {
                // No image, ensure UI is in a clean state
                cropBox.classList.add('hidden');
                (document.getElementById('crop-image-btn') as HTMLButtonElement).disabled = true;
                (document.getElementById('upscale-image-btn') as HTMLButtonElement).disabled = true;
                return;
            }
        
            if (mainImage.complete && mainImage.naturalWidth > 0) {
                setup();
            } else {
                mainImage.onload = setup;
            }
        };
        
        const deactivateCropMode = () => {
            if (!isCropModeActive.current) return;
            isCropModeActive.current = false;
            const cropBox = document.getElementById('crop-box') as HTMLDivElement;
            if (cropBox) cropBox.classList.add('hidden');

            // When switching tools, disable both crop-related buttons.
            (document.getElementById('crop-image-btn') as HTMLButtonElement).disabled = true;
            (document.getElementById('upscale-image-btn') as HTMLButtonElement).disabled = true;
            
            document.querySelectorAll('#crop-panel .aspect-btn.active').forEach(b => b.classList.remove('active'));
            activeAspectRatio.current = null;
        };

        // --- Edit Mode Helpers ---
        const updateEditUndoState = () => {
            const undoBtn = document.getElementById('undo-stroke-btn') as HTMLButtonElement;
            if (undoBtn) undoBtn.disabled = editHistoryIndex.current <= 0;
        };

        const saveEditState = () => {
            if (!isEditModeActive.current || isEditDrawing.current) return;
            const canvas = editorCanvasRef.current;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            editHistory.current = editHistory.current.slice(0, editHistoryIndex.current + 1);
            editHistory.current.push(imageData);
            editHistoryIndex.current++;
            updateEditUndoState();
        };

        const activateEditMode = () => {
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            if (!mainImage || !mainImage.src || mainImage.classList.contains('hidden') || !mainImage.complete) {
                return;
            }
            isEditModeActive.current = true;
        
            const canvas = editorCanvasRef.current;
            const ctx = canvas.getContext('2d');
            const brushPreview = document.getElementById('brush-preview') as HTMLElement;
        
            const imageRect = mainImage.getBoundingClientRect();
            canvas.width = mainImage.naturalWidth;
            canvas.height = mainImage.naturalHeight;
            canvas.style.width = `${imageRect.width}px`;
            canvas.style.height = `${imageRect.height}px`;
        
            canvas.classList.add('active');
            brushPreview.style.display = 'block';
        
            editHistory.current = [];
            editHistoryIndex.current = -1;
            isEditDrawing.current = false;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            saveEditState();
        };
        
        const deactivateEditMode = () => {
            if (!isEditModeActive.current) return;
            isEditModeActive.current = false;
        
            const canvas = editorCanvasRef.current;
            const brushPreview = document.getElementById('brush-preview') as HTMLElement;
        
            if (canvas) canvas.classList.remove('active');
            if (brushPreview) brushPreview.style.display = 'none';
        };

        // --- Comparison Viewer ---
        const showComparisonViewer = (beforeUrl: string, afterUrl: string) => {
            const viewer = document.getElementById('comparison-viewer') as HTMLElement;
            const beforeImg = document.getElementById('comparison-before-image') as HTMLImageElement;
            const afterImg = document.getElementById('comparison-after-image') as HTMLImageElement;
            const afterWrapper = document.getElementById('comparison-after-wrapper') as HTMLElement;
            const slider = document.getElementById('comparison-slider') as HTMLElement;
            const closeBtn = document.getElementById('comparison-close-btn') as HTMLButtonElement;
            const downloadBtn = document.getElementById('comparison-download-btn') as HTMLButtonElement;
            const imageWrapper = document.getElementById('image-wrapper') as HTMLElement;
            const cropBox = document.getElementById('crop-box') as HTMLElement;
    
            if (!viewer || !beforeImg || !afterImg || !afterWrapper || !slider || !closeBtn || !downloadBtn || !imageWrapper || !cropBox) {
                console.error("Comparison viewer elements not found.");
                updateMainImage(afterUrl); // Fallback to just showing the final image
                return;
            }
    
            let isSliderActive = false;
            beforeImg.src = beforeUrl;
            afterImg.src = afterUrl;
    
            const onImagesLoaded = () => {
                if (!beforeImg.complete || !afterImg.complete) return;
                
                const wrapperRect = imageWrapper.getBoundingClientRect();
                const imgAspectRatio = beforeImg.naturalWidth / beforeImg.naturalHeight;
    
                let displayWidth, displayHeight;
                if (wrapperRect.width / imgAspectRatio <= wrapperRect.height) {
                    displayWidth = wrapperRect.width;
                    displayHeight = wrapperRect.width / imgAspectRatio;
                } else {
                    displayHeight = wrapperRect.height;
                    displayWidth = wrapperRect.height * imgAspectRatio;
                }
                
                const commonStyles = { width: `${displayWidth}px`, height: `${displayHeight}px` };
                Object.assign(beforeImg.style, commonStyles);
                Object.assign(afterImg.style, commonStyles);
                
                // Position the slider correctly over the image
                const verticalOffset = (wrapperRect.height - displayHeight) / 2;
                const horizontalOffset = (wrapperRect.width - displayWidth) / 2;

                const initialSliderX = horizontalOffset + displayWidth / 2;
                slider.style.top = `${verticalOffset}px`;
                slider.style.height = `${displayHeight}px`;
                slider.style.left = `${initialSliderX}px`;
                afterWrapper.style.clipPath = `inset(0 0 0 50%)`;
    
                viewer.classList.remove('hidden');
                document.getElementById('main-image').classList.add('hidden');
                cropBox.classList.add('hidden');
            };
    
            beforeImg.onload = onImagesLoaded;
            afterImg.onload = onImagesLoaded;
            if(beforeImg.complete && afterImg.complete) {
                onImagesLoaded();
            }
    
    
            const handleMove = (e: MouseEvent) => {
                if (!isSliderActive) return;
                const imgRect = beforeImg.getBoundingClientRect();
                const wrapperRect = imageWrapper.getBoundingClientRect();

                let x = e.clientX - imgRect.left;
                x = Math.max(0, Math.min(x, imgRect.width));

                const horizontalOffset = (wrapperRect.width - imgRect.width) / 2;
                slider.style.left = `${horizontalOffset + x}px`;

                const percentage = (x / imgRect.width) * 100;
                afterWrapper.style.clipPath = `inset(0 0 0 ${percentage}%)`;
            };
            
            const handleUp = () => {
                isSliderActive = false;
                document.removeEventListener('mousemove', handleMove);
                document.removeEventListener('mouseup', handleUp);
            };
    
            slider.onmousedown = (e) => {
                e.preventDefault();
                isSliderActive = true;
                document.addEventListener('mousemove', handleMove);
                document.addEventListener('mouseup', handleUp);
            };
    
            const closeViewer = () => {
                viewer.classList.add('hidden');
                updateMainImage(afterUrl);
            };

            const handleDownloadImproved = () => {
                if (!afterUrl) return;
                const link = document.createElement('a');
                link.href = afterUrl;
                link.download = `improved-image-${Date.now()}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            
            closeBtn.onclick = closeViewer;
            downloadBtn.onclick = handleDownloadImproved;
        };
        
        // --- History & Image State Management (Refactored) ---
        const updateHistoryButtonsState = () => {
            const undoBtn = document.getElementById('undo-image-btn') as HTMLButtonElement;
            const redoBtn = document.getElementById('redo-image-btn') as HTMLButtonElement;
            if (undoBtn) undoBtn.disabled = historyIndex.current <= 0;
            if (redoBtn) redoBtn.disabled = historyIndex.current >= history.current.length - 1;
        };
        
        const _setImageAndReinit = (imageUrl: string) => {
            document.getElementById('comparison-viewer')?.classList.add('hidden');
            
            const mainImageEl = document.getElementById('main-image') as HTMLImageElement;
            mainImageEl.src = imageUrl;
            mainImageEl.classList.remove('hidden');
            document.getElementById('placeholder-content').classList.add('hidden');
            document.getElementById('content-controls').classList.remove('hidden');

            // Enable common action buttons since there's an active image
            document.querySelectorAll('.common-image-actions .secondary-btn').forEach(btn => {
                (btn as HTMLButtonElement).disabled = false;
            });
        
            ['edit-image-drop-zone', 'crop-image-drop-zone', 'camera-image-drop-zone'].forEach(zoneId => {
                const dropZone = document.getElementById(zoneId) as HTMLElement;
                if (dropZone) {
                    dropZone.style.backgroundImage = `url('${imageUrl}')`;
                    dropZone.classList.add('has-image');
                }
            });

            const reinit = () => {
                if (isEditModeActive.current) {
                    activateEditMode();
                }
                if (isCropModeActive.current) {
                    activateCropMode();
                }
                setRenderTrigger(c => c + 1);
            };
        
            if (mainImageEl.complete) {
                reinit();
            } else {
                mainImageEl.onload = reinit;
            }
        };

        const updateMainImage = (imageUrl: string) => {
            _setImageAndReinit(imageUrl);

            const newHistory = history.current.slice(0, historyIndex.current + 1);
            newHistory.push(imageUrl);
            history.current = newHistory;
            historyIndex.current = newHistory.length - 1;
        
            updateHistoryButtonsState();
        };

        const handleUndo = () => {
            if (historyIndex.current > 0) {
                historyIndex.current--;
                const newSrc = history.current[historyIndex.current];
                _setImageAndReinit(newSrc);
                updateHistoryButtonsState();
            }
        };

        const handleRedo = () => {
            if (historyIndex.current < history.current.length - 1) {
                historyIndex.current++;
                const newSrc = history.current[historyIndex.current];
                _setImageAndReinit(newSrc);
                updateHistoryButtonsState();
            }
        };
        
        const handleDownload = () => {
            const currentSrc = (document.getElementById('main-image') as HTMLImageElement).src;
            if (!currentSrc || currentSrc.endsWith('/')) return;
            const link = document.createElement('a');
            link.href = currentSrc;
            link.download = `generated-image-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
        
        const handleImageReset = () => {
            if (history.current.length > 0) {
                historyIndex.current = 0;
                const newSrc = history.current[0];
                history.current = history.current.slice(0, 1); // Prune history to just the first state
                _setImageAndReinit(newSrc);
                updateHistoryButtonsState();
            }
        };

        const handleImageDelete = () => {
            if(isEditModeActive.current) deactivateEditMode();
            if(isCropModeActive.current) deactivateCropMode();
            document.getElementById('comparison-viewer')?.classList.add('hidden');

            (document.getElementById('main-image') as HTMLImageElement).src = '';
            document.getElementById('main-image').classList.add('hidden');
            document.getElementById('placeholder-content').classList.remove('hidden');
            document.getElementById('content-controls').classList.add('hidden');
            history.current = [];
            historyIndex.current = -1;
            updateHistoryButtonsState();

            // Disable common action buttons as there's no image
            document.querySelectorAll('.common-image-actions .secondary-btn').forEach(btn => {
                (btn as HTMLButtonElement).disabled = true;
            });
            
            ['edit-image-drop-zone', 'crop-image-drop-zone', 'camera-image-drop-zone'].forEach(zoneId => {
                const dropZone = document.getElementById(zoneId) as HTMLElement;
                if (dropZone) {
                    dropZone.style.backgroundImage = '';
                    dropZone.classList.remove('has-image');
                    const fileInput = dropZone.querySelector('.file-input') as HTMLInputElement;
                    if(fileInput) fileInput.value = '';
                }
            });

            setRenderTrigger(c => c + 1);
        };

        const handleApiError = (error: any) => {
            console.error("API Error:", error);
            let errorMessage = `An error occurred: ${error.message}`;

            // Check if in AI Studio environment and if it's an API key error
            if (window.aistudio && error.message?.includes("Requested entity was not found")) {
                 errorMessage = "The selected API key is no longer valid. Please select a new one.";
                 setApiKeySelected(false);
                 const apiKeyOverlay = document.getElementById('api-key-overlay');
                 if(apiKeyOverlay) apiKeyOverlay.classList.remove('hidden');
            } else if (error.message?.includes("API key not valid")) {
                errorMessage = "The provided API key is not valid. Please check your key and try again.";
                // For Vercel, clear the bad key and ask again
                localStorage.removeItem('cutmaker_api_key');
                userApiKey.current = null;
                setApiKeySelected(false);
                document.getElementById('user-api-key-overlay')?.classList.remove('hidden');
            } else if (error.message?.includes("key is required")) {
                 errorMessage = "API key is missing. Please enter your key.";
                 document.getElementById('user-api-key-overlay')?.classList.remove('hidden');
            }
            alert(errorMessage);
        };

        const handleCameraGenerate = async () => {
            const key = window.aistudio ? (window as any).process?.env?.API_KEY : userApiKey.current;
            if (!key) {
                alert("API Key is not available. Please configure it.");
                return;
            }
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            if (!mainImage.src || mainImage.classList.contains('hidden')) {
                alert("카메라 설정을 적용할 이미지를 먼저 업로드해주세요.");
                return;
            }
        
            const verticalSlider = document.getElementById('vertical-slider') as HTMLInputElement;
            const verticalValue = parseInt(verticalSlider.value);
            let verticalText;
            if (verticalValue > 60) verticalText = '하이 앵글';
            else if (verticalValue > 20) verticalText = '부감';
            else if (verticalValue > -20) verticalText = '정면';
            else if (verticalValue > -60) verticalText = '앙각';
            else verticalText = '로우 앵글';

            
            setIsLoading(true);
            document.getElementById('loader').classList.remove('hidden');
            document.getElementById('main-image').classList.add('hidden');
            if(isCropModeActive.current) deactivateCropMode();
            if(isEditModeActive.current) deactivateEditMode();
        
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                const blob = await (await fetch(mainImage.src)).blob();
                if (!blob) throw new Error("Could not create image blob.");
                
                const file = new File([blob], 'camera_source.png', { type: 'image/png' });
                const imagePart = await fileToGenerativePart(file);
        
                let cameraPrompt = '';

                if (verticalText === '로우 앵글') {
                     cameraPrompt = `
                        Task: Re-render the provided image from a dramatic, extreme low-angle perspective.
                        
                        CRITICAL INSTRUCTIONS:
                        1.  This is a complete re-generation. You MUST redraw the entire subject and scene to fit the new perspective. Do not simply skew or distort the original image.
                        2.  Adhere EXACTLY to the following cinematic shot description: "extreme low-angle shot, ultra wide lens, ground-level camera position, upward perspective, dramatic foreshortening, exaggerated vertical scale, towering upward composition, camera placed near the floor, wide dynamic perspective, cinematic upward view, strong vertical stretch, perspective distortion from below".
                        3.  Maintain the original subject's identity, clothing, and the general environment style, but adapt them to the new, dramatic perspective.
                        4.  ABSOLUTELY CRITICAL RULE: If the subject is a human, their feet MUST be firmly planted on the ground. DO NOT show the soles of their feet or shoes. The perspective should be looking UP at the subject from near the ground level.
                        5.  The final image must not contain any text, subtitles, captions, logos, or watermarks.
                    `;
                } else {
                    const lens = (document.getElementById('lens-slider-value') as HTMLElement).textContent;
                    
                    let verticalAngleDescription = '';
                    switch (verticalText) {
                        case '하이 앵글':
                            verticalAngleDescription = "극적인 하이 앵글(Dramatic High Angle): 3점 투시도법을 적용하여 피사체를 위에서 똑바로 내려다보는 샷으로 다시 그려주세요. 피사체의 머리는 카메라에 가장 가깝기 때문에 과장되게 커 보이고, 발로 갈수록 몸이 급격히 작아지고 좁아지는 강한 투시 왜곡을 표현해야 합니다.";
                            break;
                        case '부감':
                            verticalAngleDescription = "부감(Slightly High Angle): 피사체를 약간 위에서 내려다보는 샷입니다. 약간의 투시 왜곡을 적용하여 위쪽이 미세하게 더 커 보이도록 합니다.";
                            break;
                        case '정면':
                            verticalAngleDescription = "정면 시점 (Eye-Level): 피사체를 눈높이에서 왜곡 없이 자연스럽게 바라보는 샷.";
                            break;
                        case '앙각':
                            verticalAngleDescription = "앙각(Slightly Low Angle): 피사체를 약간 아래에서 올려다보는 샷입니다. 약간의 투시 왜곡을 적용하여 아래쪽이 미세하게 더 커 보이도록 합니다.";
                            break;
                        default:
                            verticalAngleDescription = `${verticalText}: 일반적인 시점.`;
                    }

                    const horizontalSlider = document.getElementById('horizontal-slider') as HTMLInputElement;
                    const horizontalValue = parseInt(horizontalSlider.value);
                    let horizontalDirectionPrompt = '';

                    if (horizontalValue > -22.5 && horizontalValue <= 22.5) { // Front (0 deg)
                        horizontalDirectionPrompt = "front view, camera positioned directly in front, straight-on angle, zero-degree rotation, neutral perspective, symmetrical viewpoint, character facing forward";
                    } else if (horizontalValue > 22.5 && horizontalValue <= 67.5) { // Left-Front (315 deg)
                        horizontalDirectionPrompt = "front-side three-quarter view, 315-degree angle, between front and side, diagonal perspective";
                    } else if (horizontalValue > 67.5 && horizontalValue <= 112.5) { // Left Side (270 deg)
                        horizontalDirectionPrompt = "perfect side view, camera positioned at 90 degrees, profile view, straight lateral angle, zero foreshortening, clean silhouette from the side";
                    } else if (horizontalValue > 112.5 && horizontalValue <= 157.5) { // Left-Back (225 deg)
                        horizontalDirectionPrompt = "back-side three-quarter view, 225-degree angle, between back and side view, partially showing rear and profile";
                    } else if (horizontalValue > 157.5 || horizontalValue <= -157.5) { // Back (180 deg)
                        horizontalDirectionPrompt = "back view, camera placed directly behind the position, 180-degree rotation, straight-on rear view, symmetrical back silhouette";
                    } else if (horizontalValue > -157.5 && horizontalValue <= -112.5) { // Right-Back (135 deg)
                        horizontalDirectionPrompt = "rear three-quarter view (3/4 back view), camera at 135-degree angle, partially showing the back and side, angled backward view, natural perspective rotation";
                    } else if (horizontalValue > -112.5 && horizontalValue <= -67.5) { // Right Side (90 deg)
                        horizontalDirectionPrompt = "perfect side view, camera positioned at 90 degrees, profile view, straight lateral angle, zero foreshortening, clean silhouette from the side";
                    } else { // Right-Front (45 deg)
                        horizontalDirectionPrompt = "front three-quarter view (3/4 view), 45-degree camera angle from the front, slight rotation, visible two sides of the form, natural perspective, facing diagonally";
                    }


                    cameraPrompt = `
                        Task: Re-render the provided image with new camera settings, applying artistic perspective distortion.
                        Instructions:
                        1.  Identify the main subject in the image.
                        2.  Redraw the entire subject and scene from the new perspective defined by the camera parameters below.
                        3.  Maintain the original character design, clothing, art style, and overall mood.
                        4.  This is NOT a simple crop, skew, or lens distortion. It is a complete re-generation applying the principles of perspective drawing (e.g., 3-point perspective for dramatic angles).
                        5.  CRITICAL: The final image must not contain any text, subtitles, captions, logos, or watermarks of any kind.
            
                        --- Camera Settings ---
                        Vertical Angle Instruction: ${verticalAngleDescription}
                        Horizontal Direction Instruction: ${horizontalDirectionPrompt}
                        Lens Focal Length: ${lens}
                    `;
                }
                
                const userPrompt = [
                    { text: cameraPrompt },
                    imagePart
                ];
        
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: userPrompt },
                    config: { responseModalities: [Modality.IMAGE] },
                });
        
                const firstPart = response.candidates?.[0]?.content?.parts?.[0];
                if (firstPart && firstPart.inlineData) {
                    const imageUrl = `data:${firstPart.inlineData.mimeType};base64,${firstPart.inlineData.data}`;
                    updateMainImage(imageUrl);
                } else {
                    throw new Error("No image was generated in the response.");
                }
        
            } catch (error) {
                handleApiError(error);
                document.getElementById('main-image').classList.remove('hidden'); // Show the original image again on failure
            } finally {
                setIsLoading(false);
                document.getElementById('loader').classList.add('hidden');
            }
        };

        const setupAllListeners = () => {
            // Setup toolbar listeners
            const toolBtns = document.querySelectorAll('.tool-btn');
            toolBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const mode = (btn as HTMLElement).dataset.mode;
                    
                    if(isEditModeActive.current && mode !== 'edit') deactivateEditMode();
                    if(isCropModeActive.current && mode !== 'crop') deactivateCropMode();

                    document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
                    document.getElementById(`${mode}-panel`).classList.remove('hidden');
                    toolBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    if (mode === 'edit') {
                        activateEditMode();
                    } else if (mode === 'crop') {
                        activateCropMode();
                    }
                });
            });
            
            // Setup drop zones for generate panel
            setupDropZoneSection('subject');
            setupDropZoneSection('scene');
            setupDropZoneSection('style');
            
            // Setup drop zones for compose panel
            setupDropZoneSection('characters');
            setupDropZoneSection('background');

            // Setup Single Image Input Panels
            const setupSingleImageDropZone = (zoneId: string) => {
                const zone = document.getElementById(zoneId) as HTMLElement;
                if (!zone) return;
                const fileInput = zone.querySelector('.file-input') as HTMLInputElement;
                const deleteBtn = zone.querySelector('.individual-delete-btn') as HTMLElement;
    
                const handleFile = (file: File) => {
                    if (!file || !file.type.startsWith('image/')) return;
    
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const imageUrl = reader.result as string;
                        updateMainImage(imageUrl);
                    };
                    reader.readAsDataURL(file);
                };
    
                zone.addEventListener('click', (e) => {
                    if ((e.target as HTMLElement).closest('.individual-delete-btn')) return;
                    if (fileInput) fileInput.click();
                });
                if (fileInput) fileInput.addEventListener('change', (e) => handleFile((e.target as HTMLInputElement).files[0]));
                
                zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
                zone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('dragover'); });
                zone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    zone.classList.remove('dragover');
                    handleFile(e.dataTransfer.files[0]);
                });
    
                if(deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleImageDelete();
                    });
                }
            };
            setupSingleImageDropZone('edit-image-drop-zone');
            setupSingleImageDropZone('crop-image-drop-zone');
            setupSingleImageDropZone('camera-image-drop-zone');


            // Setup Generate Button
            const generateBtn = document.getElementById('generate-btn');
            generateBtn.addEventListener('click', handleGenerate);
            updateGenerateButtonState();

            // Setup Compose Button
            const composeBtn = document.getElementById('compose-scene-btn');
            composeBtn.addEventListener('click', handleComposeScene);
            updateComposeButtonState(); 

            // Setup content controls
            document.getElementById('undo-image-btn').addEventListener('click', handleUndo);
            document.getElementById('redo-image-btn').addEventListener('click', handleRedo);
            document.getElementById('download-btn').addEventListener('click', handleDownload);
            document.querySelectorAll('.image-reset-btn').forEach(btn => btn.addEventListener('click', handleImageReset));
            document.querySelectorAll('.image-delete-btn').forEach(btn => btn.addEventListener('click', handleImageDelete));

            // Setup Annotation Modal
            setupAnnotationModal();
            // Setup Edit Mode
            setupEditMode();
            // Setup Crop Mode
            setupCropMode();
            // Setup Camera Mode
            setupCameraMode();
            // Setup Light Mode
            setupLightMode();
            // Setup Language Switcher
            setupLanguageSwitcher();
            
            // Setup API Key flow
            const setupApiKeyFlow = async () => {
                if ((window as any).aistudio && typeof (window as any).aistudio.hasSelectedApiKey === 'function') {
                    // AI Studio Environment
                    const apiKeyOverlay = document.getElementById('api-key-overlay');
                    const selectApiKeyBtn = document.getElementById('select-api-key-btn');
            
                    const checkApiKey = async () => {
                        if (await (window as any).aistudio.hasSelectedApiKey()) {
                            setApiKeySelected(true);
                            if (apiKeyOverlay) apiKeyOverlay.classList.add('hidden');
                        } else {
                            setApiKeySelected(false);
                            if (apiKeyOverlay) apiKeyOverlay.classList.remove('hidden');
                        }
                    };
            
                    if (selectApiKeyBtn) {
                        selectApiKeyBtn.addEventListener('click', async () => {
                            await (window as any).aistudio.openSelectKey();
                            setApiKeySelected(true);
                            if (apiKeyOverlay) apiKeyOverlay.classList.add('hidden');
                        });
                    }
            
                    await checkApiKey();
                } else {
                    // Vercel / Web Environment
                    const userApiKeyOverlay = document.getElementById('user-api-key-overlay');
                    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
                    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
            
                    const savedKey = localStorage.getItem('cutmaker_api_key');
                    if (savedKey) {
                        userApiKey.current = savedKey;
                        setApiKeySelected(true);
                    } else {
                        if (userApiKeyOverlay) userApiKeyOverlay.classList.remove('hidden');
                    }
            
                    if (saveApiKeyBtn && apiKeyInput) {
                        saveApiKeyBtn.addEventListener('click', () => {
                            const key = apiKeyInput.value.trim();
                            if (key) {
                                localStorage.setItem('cutmaker_api_key', key);
                                userApiKey.current = key;
                                setApiKeySelected(true);
                                if (userApiKeyOverlay) userApiKeyOverlay.classList.add('hidden');
                            } else {
                                alert("Please enter a valid API key.");
                            }
                        });
                    }
                }
            };
            
            setupApiKeyFlow();
        };
        
        const updateGenerateButtonState = () => {
            const generateBtn = document.getElementById('generate-btn');
            if (!generateBtn) return;
            const hasSubject = imageSources.current.subject.some(img => img !== null);
            const hasScene = imageSources.current.scene.some(img => img !== null);
            (generateBtn as HTMLButtonElement).disabled = !hasSubject || !hasScene;
        };
        
        const updateComposeButtonState = () => {
            const composeBtn = document.getElementById('compose-scene-btn');
            if (!composeBtn) return;
            const hasCharacter = imageSources.current.characters.some(img => img !== null);
            const hasBackground = imageSources.current.background.some(img => img !== null);
             (composeBtn as HTMLButtonElement).disabled = !hasCharacter || !hasBackground;
        }

        const setupDropZoneSection = (type) => {
            const section = document.querySelector(`.composition-section[data-type="${type}"]`);
            if (!section) return;

            const addBtn = section.querySelector('.add-btn');
            const deleteAllBtn = section.querySelector('.delete-btn');
            const container = section.querySelector('.drop-zone-container');

            if (addBtn) {
                addBtn.addEventListener('click', () => {
                    const newIndex = imageSources.current[type].length;
                    imageSources.current[type].push(null);
                    const newDropZone = createDropZoneElement(type, newIndex);
                    container.appendChild(newDropZone);
                    setupDropZone(newDropZone, type, newIndex);
                });
            }

            if (deleteAllBtn) {
                deleteAllBtn.addEventListener('click', () => {
                    container.innerHTML = '';
                    imageSources.current[type] = [null];
                    const newDropZone = createDropZoneElement(type, 0);
                    container.appendChild(newDropZone);
                    setupDropZone(newDropZone, type, 0);
                    updateGenerateButtonState();
                    updateComposeButtonState();
                     if (type === 'background') {
                        document.getElementById('edit-scene-btn').classList.add('hidden');
                    }
                });
            }
            
            const initialDropZone = section.querySelector('.drop-zone');
            if (initialDropZone) {
              setupDropZone(initialDropZone, type, 0);
            }
        };
        
        const createDropZoneElement = (type, index) => {
            const dropZone = document.createElement('div');
            dropZone.className = 'drop-zone';
             if (type === 'characters') {
                dropZone.classList.add('character-drop-zone');
            }
            let innerHTML = `
                <button class="icon-btn individual-delete-btn"><span class="material-symbols-outlined">close</span></button>
                <span class="material-symbols-outlined placeholder-icon">${type === 'characters' ? 'person_add' : 'add_photo_alternate'}</span>
                <p>이미지 드롭 또는 클릭</p>
                <input type="file" accept="image/*" class="file-input">
            `;
            if (type === 'characters') {
                 innerHTML = `<span class="char-number">${index + 1}</span>` + innerHTML;
            }
            dropZone.innerHTML = innerHTML;
            return dropZone;
        }

        const setupDropZone = (zone, type, index) => {
            if (!zone) return;
            const fileInput = zone.querySelector('.file-input') as HTMLInputElement;
            const deleteBtn = zone.querySelector('.individual-delete-btn');

            const handleFile = (file) => {
                if (!file || !file.type.startsWith('image/')) return;

                imageSources.current[type][index] = file;
                const reader = new FileReader();
                reader.onloadend = () => {
                    zone.style.backgroundImage = `url('${reader.result}')`;
                    zone.classList.add('has-image');
                     if (type === 'background') {
                        document.getElementById('edit-scene-btn').classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
                updateGenerateButtonState();
                updateComposeButtonState();
            };

            zone.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                if (!target) return;
                if (target.classList.contains('individual-delete-btn') || target.parentElement?.classList.contains('individual-delete-btn')) return;
                fileInput?.click();
            });
            if (fileInput) fileInput.addEventListener('change', (e) => handleFile((e.target as HTMLInputElement).files[0]));
            
            zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
            zone.addEventListener('dragleave', (e) => { e.preventDefault(); zone.classList.remove('dragover'); });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                handleFile(e.dataTransfer.files[0]);
            });

            if(deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    imageSources.current[type][index] = null;
                    zone.style.backgroundImage = '';
                    zone.classList.remove('has-image');
                    if (fileInput) fileInput.value = '';
                    updateGenerateButtonState();
                    updateComposeButtonState();
                    
                     if (type === 'background') {
                        const hasAnyBackground = imageSources.current.background.some(f => f !== null);
                        if (!hasAnyBackground) {
                           document.getElementById('edit-scene-btn').classList.add('hidden');
                        }
                    }

                    const container = zone.parentElement;
                    if (container && container.children.length > 1) {
                         zone.remove();
                         // This is a simplification; a more robust solution would re-index the array and character numbers.
                    }
                });
            }
        };

        const setupAnnotationModal = () => {
            const modal = document.getElementById('annotation-modal');
            const canvas = annotationCanvasRef.current ?? document.getElementById('annotation-canvas') as HTMLCanvasElement;
            if (!annotationCanvasRef.current) (annotationCanvasRef as any).current = canvas;
            const ctx = canvas.getContext('2d');
            const editSceneBtn = document.getElementById('edit-scene-btn');
            const saveBtn = document.getElementById('annotation-save-btn');
            const closeBtn = document.getElementById('annotation-close-btn');
            const canvasContainer = document.getElementById('annotation-canvas-container');
            let wasJustDeselected = false;

            const handleKeyDown = (e: KeyboardEvent) => {
                if (!selectedTextId.current) return;
                if (e.target instanceof HTMLTextAreaElement) return;

                if (e.key === 'Delete' || e.key === 'Backspace') {
                    const wrapper = annotationTextElements.current[selectedTextId.current];
                    if (wrapper) {
                        wrapper.remove();
                        delete annotationTextElements.current[selectedTextId.current];
                        selectedTextId.current = null;
                    }
                }
            };
            
            const updateAnnotationUndoRedoState = () => {
                const undoBtn = document.getElementById('annotation-undo-btn') as HTMLButtonElement;
                const redoBtn = document.getElementById('annotation-redo-btn') as HTMLButtonElement;
                if (undoBtn) undoBtn.disabled = annotationHistoryIndex.current <= 0;
                if (redoBtn) redoBtn.disabled = annotationHistoryIndex.current >= annotationHistory.current.length - 1;
            };

            const openModal = () => {
                const bgFile = imageSources.current.background.find(f => f);
                if (!bgFile) return;

                const img = new Image();
                img.onload = () => {
                    annotationOriginalImage.current = img;
                    // Adjust canvas size based on image aspect ratio and viewport
                    const viewportW = window.innerWidth * 0.95;
                    const viewportH = window.innerHeight * 0.9;
                    const imgAspectRatio = img.width / img.height;
                    let canvasW = viewportW;
                    let canvasH = viewportW / imgAspectRatio;
                    if (canvasH > viewportH) {
                        canvasH = viewportH;
                        canvasW = viewportH * imgAspectRatio;
                    }
                    canvas.width = img.width;
                    canvas.height = img.height;
                    canvas.style.width = `${canvasW}px`;
                    canvas.style.height = `${canvasH}px`;

                    ctx.drawImage(img, 0, 0);
                    modal.classList.remove('hidden');

                    // Reset state for new editing session
                    annotationHistory.current = [];
                    annotationHistoryIndex.current = -1;
                    Object.values(annotationTextElements.current).forEach((el: HTMLElement) => el.remove());
                    annotationTextElements.current = {};
                    selectedTextId.current = null;
                    document.addEventListener('keydown', handleKeyDown);
                    
                    saveAnnotationState();
                };
                img.src = URL.createObjectURL(bgFile);
            };

            const drawTextOnCanvas = () => {
                const scale = canvas.width / canvas.getBoundingClientRect().width;
                Object.values(annotationTextElements.current).forEach((el: HTMLElement) => {
                    const textarea = el.querySelector('textarea');
                    if (!textarea) return;
                    const text = textarea.value;
                    const style = window.getComputedStyle(el);
                    const textStyle = window.getComputedStyle(textarea);

                    const x = parseFloat(style.left);
                    const y = parseFloat(style.top);
                    const color = textStyle.color;
                    const fontSize = parseFloat(textStyle.fontSize);
                    const fontFamily = textStyle.fontFamily;
                    const canvasFontSize = fontSize * scale;

                    ctx.font = `${canvasFontSize}px ${fontFamily}`;
                    ctx.fillStyle = color;
                    ctx.textBaseline = 'top';

                    const lines = text.split('\n');
                    lines.forEach((line, i) => {
                        ctx.fillText(line, x * scale, (y * scale) + (i * canvasFontSize * 1.2));
                    });
                });
            };

            const cleanupAndCloseModal = (andSave = false) => {
                const performClose = (fileToSave: File | null = null) => {
                    if (andSave && fileToSave) {
                        // This is the save logic
                        imageSources.current.background[0] = fileToSave;
                        const dropZone = document.getElementById('background-drop-zone') as HTMLElement;
                        if (dropZone) {
                            const objectURL = URL.createObjectURL(fileToSave);
                            dropZone.style.backgroundImage = `url('${objectURL}')`;
                            dropZone.classList.add('has-image');
                        }
                    }
            
                    modal.classList.add('hidden');
                    document.removeEventListener('keydown', handleKeyDown);
            
                    Object.values(annotationTextElements.current).forEach((el: HTMLElement) => el.remove());
                    annotationTextElements.current = {};
                    selectedTextId.current = null;
                };
                
                if (andSave) {
                    drawTextOnCanvas(); // Burn text onto canvas before saving
                    canvas.toBlob(blob => {
                        if (blob) {
                            const newFile = new File([blob], "annotated_background.png", { type: "image/png" });
                            performClose(newFile);
                        } else {
                            console.error("Failed to create blob from canvas.");
                            performClose(null); // Close without saving on error
                        }
                    }, 'image/png');
                } else {
                    performClose(null); // Just close without saving
                }
            };

            editSceneBtn.addEventListener('click', openModal);
            saveBtn.addEventListener('click', () => cleanupAndCloseModal(true));
            closeBtn.addEventListener('click', () => cleanupAndCloseModal(false));

            const deselectText = () => {
                if (selectedTextId.current && annotationTextElements.current[selectedTextId.current]) {
                    annotationTextElements.current[selectedTextId.current].classList.remove('selected');
                }
                selectedTextId.current = null;
                wasJustDeselected = true;
                setTimeout(() => { wasJustDeselected = false; }, 0);
            };

            const selectText = (id, element) => {
                deselectText();
                selectedTextId.current = id;
                element.classList.add('selected');
                // The wasJustDeselected flag should be false when an item is selected.
                wasJustDeselected = false;
            };

            const autoResizeTextarea = (e) => {
                const textarea = e.target as HTMLTextAreaElement;
                textarea.style.height = 'auto';
                textarea.style.height = `${textarea.scrollHeight}px`;
            };
            
            const addTextElement = (x, y) => {
                deselectText();
                const id = `text-${textIdCounter.current++}`;

                const wrapper = document.createElement('div');
                wrapper.id = id;
                wrapper.className = 'anno-text-wrapper';
                wrapper.style.left = `${x}px`;
                wrapper.style.top = `${y}px`;
                wrapper.style.width = '150px';
                
                const textarea = document.createElement('textarea');
                textarea.className = 'anno-textarea';
                textarea.placeholder = '텍스트 입력...';
                textarea.style.fontSize = `${textSize.current}px`;
                textarea.style.color = brushColor.current;
                textarea.addEventListener('input', autoResizeTextarea);

                const actions = document.createElement('div');
                actions.className = 'anno-text-actions';

                const applyBtn = document.createElement('button');
                applyBtn.className = 'anno-text-action-btn apply';
                applyBtn.innerHTML = `<span class="material-symbols-outlined">check</span>`;
                applyBtn.title = 'Apply';
                applyBtn.onclick = (e) => {
                    e.stopPropagation();
                    deselectText();
                };
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'anno-text-action-btn delete';
                deleteBtn.innerHTML = `<span class="material-symbols-outlined">close</span>`;
                deleteBtn.title = 'Delete';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    wrapper.remove();
                    delete annotationTextElements.current[id];
                    if (selectedTextId.current === id) {
                        selectedTextId.current = null;
                    }
                };
                
                actions.appendChild(applyBtn);
                actions.appendChild(deleteBtn);
                
                wrapper.appendChild(textarea);
                wrapper.appendChild(actions);
                
                const resizeHandle = document.createElement('div');
                resizeHandle.className = 'anno-resize-handle';
                wrapper.appendChild(resizeHandle);
                
                canvasContainer.appendChild(wrapper);
                annotationTextElements.current[id] = wrapper;
                
                selectText(id, wrapper);
                textarea.focus();
                autoResizeTextarea({ target: textarea });

                // Drag logic
                wrapper.addEventListener('mousedown', (e) => {
                    if (e.target !== resizeHandle && !(e.target as Element).closest('.anno-text-actions')) {
                        e.stopPropagation();
                        selectText(id, wrapper);
                        const dragStartX = e.clientX;
                        const dragStartY = e.clientY;
                        const elStartX = wrapper.offsetLeft;
                        const elStartY = wrapper.offsetTop;
                        
                        const onDragMove = (moveEvent) => {
                            const dx = moveEvent.clientX - dragStartX;
                            const dy = moveEvent.clientY - dragStartY;
                            wrapper.style.left = `${elStartX + dx}px`;
                            wrapper.style.top = `${elStartY + dy}px`;
                        };
                        const onDragEnd = () => {
                            document.removeEventListener('mousemove', onDragMove);
                            document.removeEventListener('mouseup', onDragEnd);
                        };
                        document.addEventListener('mousemove', onDragMove);
                        document.addEventListener('mouseup', onDragEnd);
                    }
                });

                // Resize logic
                resizeHandle.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    selectText(id, wrapper);
                    const resizeStartX = e.clientX;
                    const startWidth = wrapper.offsetWidth;
                    const startFontSize = parseFloat(textarea.style.fontSize) || textSize.current;

                    const onResizeMove = (moveEvent) => {
                        const dx = moveEvent.clientX - resizeStartX;
                        const newWidth = startWidth + dx;

                        if (newWidth > 50) { // Minimum width
                            wrapper.style.width = `${newWidth}px`;
                            
                            // Adjust font size proportionally to width change
                            const scaleFactor = newWidth / startWidth;
                            const newFontSize = startFontSize * scaleFactor;
                            
                            if (newFontSize > 8) { // Minimum font size
                                textarea.style.fontSize = `${newFontSize}px`;
                                autoResizeTextarea({ target: textarea });
                            }
                        }
                    };
                    const onResizeEnd = () => {
                        document.removeEventListener('mousemove', onResizeMove);
                        document.removeEventListener('mouseup', onResizeEnd);
                    };
                    document.addEventListener('mousemove', onResizeMove);
                    document.addEventListener('mouseup', onResizeEnd);
                });
            };

            // Toolbar logic
            const toolbar = document.getElementById('annotation-toolbar');
            toolbar.addEventListener('click', (e) => {
                const target = e.target;
                if (!(target instanceof Element)) return;

                const toolBtn = target.closest('.tool-btn-anno');
                const colorSwatch = target.closest('.color-swatch');

                if (toolBtn) {
                    const tool = (toolBtn as HTMLElement).dataset.tool;
                    if (tool) {
                       toolbar.querySelectorAll('.tool-btn-anno').forEach(b => b.classList.remove('active'));
                        toolBtn.classList.add('active');
                        activeAnnotationTool.current = tool;
                        
                        document.getElementById('annotation-brush-size-group').classList.toggle('hidden', activeAnnotationTool.current !== 'brush' && activeAnnotationTool.current !== 'eraser');
                        document.getElementById('annotation-text-size-group').classList.toggle('hidden', activeAnnotationTool.current !== 'text');

                        if (activeAnnotationTool.current !== 'text' && selectedTextId.current) {
                           deselectText();
                        }
                    }
                }
                if (colorSwatch) {
                     toolbar.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('active'));
                    colorSwatch.classList.add('active');
                    brushColor.current = (colorSwatch as HTMLElement).dataset.color;
                     if (selectedTextId.current && annotationTextElements.current[selectedTextId.current]) {
                        const wrapper = annotationTextElements.current[selectedTextId.current];
                        const textarea = wrapper.querySelector('textarea');
                        if(textarea) textarea.style.color = brushColor.current;
                    }
                }
            });

            // Size sliders
            const brushSizeSlider = document.getElementById('annotation-brush-size') as HTMLInputElement;
            const brushSizeValue = document.getElementById('annotation-brush-size-value');
            brushSizeSlider.addEventListener('input', (e) => {
                brushSize.current = parseInt((e.target as HTMLInputElement).value);
                if (brushSizeValue) brushSizeValue.textContent = (e.target as HTMLInputElement).value;
            });
            const textSizeSlider = document.getElementById('annotation-text-size') as HTMLInputElement;
            const textSizeValue = document.getElementById('annotation-text-size-value');
            textSizeSlider.addEventListener('input', (e) => {
                textSize.current = parseInt((e.target as HTMLInputElement).value);
                if(textSizeValue) textSizeValue.textContent = (e.target as HTMLInputElement).value;
                 if (selectedTextId.current && annotationTextElements.current[selectedTextId.current]) {
                    const textarea = annotationTextElements.current[selectedTextId.current].querySelector('textarea');
                    if (textarea) {
                        textarea.style.fontSize = `${textSize.current}px`;
                        autoResizeTextarea({ target: textarea });
                    }
                }
            });

            // Canvas drawing events
            const getMousePos = (e) => {
                 const rect = canvas.getBoundingClientRect();
                 const scaleX = canvas.width / rect.width;
                 const scaleY = canvas.height / rect.height;
                 return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
            };
            
            let lastPos = { x: 0, y: 0 };
            const startDrawing = (e) => {
                const tool = activeAnnotationTool.current;
                 if (tool !== 'brush' && tool !== 'eraser') {
                    if (e.target !== canvas) deselectText();
                    return;
                }
            
                isDrawing.current = true;
                const { x, y } = getMousePos(e);
                lastPos = { x, y };
            
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = brushSize.current * (canvas.width / canvas.getBoundingClientRect().width);
            
                if (tool === 'eraser') {
                    ctx.globalCompositeOperation = 'destination-out';
                } else {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = brushColor.current;
                }
            
                ctx.beginPath();
                ctx.moveTo(x, y);
            };
            const draw = (e) => {
                if (!isDrawing.current) return;
                const { x, y } = getMousePos(e);
                
                ctx.quadraticCurveTo(lastPos.x, lastPos.y, (lastPos.x + x) / 2, (lastPos.y + y) / 2);
                ctx.lineTo(x, y);
                ctx.stroke();
                lastPos = { x, y };
            };
            const stopDrawing = () => {
                if (!isDrawing.current) return;
                ctx.closePath();
                isDrawing.current = false;
                ctx.globalCompositeOperation = 'source-over';
                saveAnnotationState();
            };
            
            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseleave', stopDrawing);

            canvas.addEventListener('click', (e) => {
                if (activeAnnotationTool.current === 'text') {
                    if (wasJustDeselected) return;
                    const rect = canvas.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    addTextElement(x, y);
                }
            });

            canvasContainer.addEventListener('mousedown', (e) => {
                if (selectedTextId.current && (e.target === canvasContainer || e.target === canvas)) {
                    deselectText();
                }
            })

             // Undo/Redo/Clear
            const saveAnnotationState = () => {
                if (isDrawing.current) return; // Don't save while actively drawing
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                annotationHistory.current = annotationHistory.current.slice(0, annotationHistoryIndex.current + 1);
                annotationHistory.current.push(imageData);
                annotationHistoryIndex.current++;
                updateAnnotationUndoRedoState();
            };

            document.getElementById('annotation-undo-btn').addEventListener('click', () => {
                if (annotationHistoryIndex.current > 0) {
                    annotationHistoryIndex.current--;
                    const imageData = annotationHistory.current[annotationHistoryIndex.current];
                    if (imageData) ctx.putImageData(imageData, 0, 0);
                    updateAnnotationUndoRedoState();
                }
            });
            document.getElementById('annotation-redo-btn').addEventListener('click', () => {
                 if (annotationHistoryIndex.current < annotationHistory.current.length - 1) {
                    annotationHistoryIndex.current++;
                    const imageData = annotationHistory.current[annotationHistoryIndex.current];
                    if (imageData) ctx.putImageData(imageData, 0, 0);
                    updateAnnotationUndoRedoState();
                }
            });
            document.getElementById('annotation-clear-btn').addEventListener('click', () => {
                 if (annotationHistory.current.length > 0) {
                    ctx.putImageData(annotationHistory.current[0], 0, 0);
                    saveAnnotationState();
                    Object.values(annotationTextElements.current).forEach((el: HTMLElement) => el.remove());
                    annotationTextElements.current = {};
                    selectedTextId.current = null;
                }
            });
        };
        
        // --- Edit Mode Functions ---

        const handleBrushSizeChange = (e: Event) => {
            editBrushSize.current = parseInt((e.target as HTMLInputElement).value);
            (document.getElementById('brush-size-value') as HTMLElement).textContent = (e.target as HTMLInputElement).value;
        };

        const updateBrushPreview = (e: MouseEvent) => {
            if (!isEditModeActive.current) return;
            const brushPreview = document.getElementById('brush-preview') as HTMLElement;
            const imageWrapper = document.getElementById('image-wrapper') as HTMLElement;
            const wrapperRect = imageWrapper.getBoundingClientRect();
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            const imageRect = mainImage.getBoundingClientRect();
        
            if (e.clientX >= imageRect.left && e.clientX <= imageRect.right && e.clientY >= imageRect.top && e.clientY <= imageRect.bottom) {
                brushPreview.style.display = 'block';
                const scale = imageRect.width / mainImage.naturalWidth;
                const size = editBrushSize.current * scale;
                brushPreview.style.width = `${size}px`;
                brushPreview.style.height = `${size}px`;
                brushPreview.style.left = `${e.clientX - wrapperRect.left}px`;
                brushPreview.style.top = `${e.clientY - wrapperRect.top}px`;
            } else {
                brushPreview.style.display = 'none';
            }
        };

        const getEditMousePos = (e: MouseEvent) => {
            const canvas = editorCanvasRef.current;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
        };

        let lastEditPos = { x: 0, y: 0 };
        const startEditDrawing = (e: MouseEvent) => {
            if (!isEditModeActive.current || e.button !== 0) return;
            e.preventDefault();
            isEditDrawing.current = true;
            const { x, y } = getEditMousePos(e);
            lastEditPos = { x, y };

            const canvas = editorCanvasRef.current;
            const ctx = canvas.getContext('2d');
            const rect = canvas.getBoundingClientRect();
            const scale = canvas.width / rect.width;

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = editBrushSize.current * scale;
            ctx.strokeStyle = 'rgba(255, 235, 59, 0.7)';
            ctx.globalCompositeOperation = 'source-over'; // Explicitly set to brush mode

            ctx.beginPath();
            ctx.moveTo(x, y);
        };

        const drawOnEditCanvas = (e: MouseEvent) => {
            if (!isEditDrawing.current || !isEditModeActive.current) return;
            const { x, y } = getEditMousePos(e);
            const ctx = editorCanvasRef.current.getContext('2d');
            
            ctx.lineTo(x, y);
            ctx.stroke();
            lastEditPos = { x, y };
        };

        const stopEditDrawing = () => {
            if (!isEditDrawing.current || !isEditModeActive.current) return;
            const ctx = editorCanvasRef.current.getContext('2d');
            ctx.closePath();
            isEditDrawing.current = false;
            saveEditState();
        };

        const handleUndoStroke = () => {
            if (!isEditModeActive.current || editHistoryIndex.current <= 0) return;
            editHistoryIndex.current--;
            const imageData = editHistory.current[editHistoryIndex.current];
            const canvas = editorCanvasRef.current;
            const ctx = canvas.getContext('2d');
            if (imageData) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.putImageData(imageData, 0, 0);
            }
            updateEditUndoState();
        };

        const handleClearMask = () => {
            if (!isEditModeActive.current) return;
            const canvas = editorCanvasRef.current;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            saveEditState();
        };

        const handleApplyEdit = async () => {
            const key = window.aistudio ? (window as any).process?.env?.API_KEY : userApiKey.current;
            if (!key) {
                alert("API Key is not available. Please configure it.");
                return;
            }
            if (!isEditModeActive.current) return;
        
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            const editCanvas = editorCanvasRef.current;
            const prompt = (document.getElementById('edit-prompt-input') as HTMLTextAreaElement).value;
        
            if (!mainImage.src || mainImage.classList.contains('hidden')) {
                alert("수정할 이미지가 없습니다.");
                return;
            }
            if (!prompt) {
                alert("수정할 내용을 입력해주세요.");
                return;
            }
        
            const maskData = editCanvas.getContext('2d').getImageData(0, 0, editCanvas.width, editCanvas.height).data;
            if (!maskData.some(channel => channel !== 0)) {
                alert("수정할 영역을 브러시로 선택해주세요.");
                return;
            }
        
            setIsLoading(true);
            document.getElementById('loader').classList.remove('hidden');
            document.getElementById('main-image').classList.add('hidden');
            deactivateEditMode();
        
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                // Create a temporary canvas to combine image and mask
                const tempCanvas = document.createElement('canvas');
                const tempCtx = tempCanvas.getContext('2d');
                tempCanvas.width = mainImage.naturalWidth;
                tempCanvas.height = mainImage.naturalHeight;
                
                // Draw original image first
                tempCtx.drawImage(mainImage, 0, 0);
                
                // Then draw the mask on top
                tempCtx.drawImage(editCanvas, 0, 0);
        
                const blob = await new Promise<Blob | null>(resolve => tempCanvas.toBlob(resolve, 'image/png'));
                if (!blob) throw new Error("Could not create image blob for editing.");
        
                const file = new File([blob], 'edit_image.png', { type: 'image/png' });
                const imagePart = await fileToGenerativePart(file);
        
                const userPrompt = [
                    { text: "You are an expert image editor. The user has provided an image with a semi-transparent colored mask drawn on it. You must edit ONLY the area indicated by the mask according to the user's text prompt. Preserve the rest of the image perfectly." },
                    { text: `User's edit instruction: "${prompt}"` },
                    imagePart
                ];
        
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: userPrompt },
                    config: { responseModalities: [Modality.IMAGE] },
                });
        
                const firstPart = response.candidates?.[0]?.content?.parts?.[0];
                if (firstPart && firstPart.inlineData) {
                    const imageUrl = `data:${firstPart.inlineData.mimeType};base64,${firstPart.inlineData.data}`;
                    updateMainImage(imageUrl);
                } else {
                    throw new Error("No image was generated in the response.");
                }
        
            } catch (error) {
                handleApiError(error);
                document.getElementById('main-image').classList.remove('hidden');
            } finally {
                setIsLoading(false);
                document.getElementById('loader').classList.add('hidden');
            }
        };

        const setupEditMode = () => {
            const canvas = document.getElementById('editor-canvas') as HTMLCanvasElement;
            if (!editorCanvasRef.current) (editorCanvasRef as any).current = canvas;

            document.getElementById('brush-size').addEventListener('input', handleBrushSizeChange);
            document.getElementById('undo-stroke-btn').addEventListener('click', handleUndoStroke);
            document.getElementById('clear-mask-btn').addEventListener('click', handleClearMask);
            document.getElementById('apply-edit-btn').addEventListener('click', handleApplyEdit);

            const imageWrapper = document.getElementById('image-wrapper');
            canvas.addEventListener('mousedown', startEditDrawing);
            canvas.addEventListener('mousemove', drawOnEditCanvas);
            canvas.addEventListener('mouseup', stopEditDrawing);
            canvas.addEventListener('mouseleave', stopEditDrawing);
            imageWrapper.addEventListener('mousemove', updateBrushPreview);
        };
        
        // --- Crop Mode Functions ---
        const handleCropInteractionMove = (e: MouseEvent) => {
            if (!dragInfo.current.active) return;
            
            const dx = e.clientX - dragInfo.current.startX;
            const dy = e.clientY - dragInfo.current.startY;
            
            const { type, handle, startBox } = dragInfo.current;
            let newBox = { ...startBox };
        
            if (type === 'move') {
                newBox.x += dx;
                newBox.y += dy;
            } else if (type === 'resize') {
                 if (handle.includes('right')) newBox.width = startBox.width + dx;
                 if (handle.includes('left')) { newBox.width = startBox.width - dx; newBox.x = startBox.x + dx; }
                 if (handle.includes('bottom')) newBox.height = startBox.height + dy;
                 if (handle.includes('top')) { newBox.height = startBox.height - dy; newBox.y = startBox.y + dy; }
        
                if (activeAspectRatio.current) {
                    const [w, h] = activeAspectRatio.current.split(':').map(Number);
                    const ratio = w / h;
                    
                    if (handle.includes('left') || handle.includes('right')) {
                         const oldHeight = newBox.height;
                         newBox.height = newBox.width / ratio;
                         if (handle.includes('top')) {
                            newBox.y += oldHeight - newBox.height;
                         } else if (!handle.includes('bottom')){ // Side handles
                            newBox.y = startBox.y + (startBox.height - newBox.height) / 2;
                         }
                    } else { // Top, bottom, or corner where height changed first
                         const oldWidth = newBox.width;
                         newBox.width = newBox.height * ratio;
                         if (handle.includes('left')) {
                            newBox.x += oldWidth - newBox.width;
                         } else if (!handle.includes('right')) { // Side handles
                            newBox.x = startBox.x + (startBox.width - newBox.width) / 2;
                         }
                    }
                }
            }
            
            // Boundary checks
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            const imageRect = mainImage.getBoundingClientRect();
            const wrapperRect = (document.getElementById('image-wrapper') as HTMLElement).getBoundingClientRect();
            const imgOffsetX = imageRect.left - wrapperRect.left;
            const imgOffsetY = imageRect.top - wrapperRect.top;
        
            if (newBox.x < imgOffsetX) { newBox.width += newBox.x - imgOffsetX; newBox.x = imgOffsetX; }
            if (newBox.y < imgOffsetY) { newBox.height += newBox.y - imgOffsetY; newBox.y = imgOffsetY; }
            if (newBox.x + newBox.width > imgOffsetX + imageRect.width) {
                newBox.width = imgOffsetX + imageRect.width - newBox.x;
            }
            if (newBox.y + newBox.height > imgOffsetY + imageRect.height) {
                newBox.height = imgOffsetY + imageRect.height - newBox.y;
            }
            
            if (newBox.width < 20) newBox.width = 20;
            if (newBox.height < 20) newBox.height = 20;

            cropState.current = newBox;
            updateCropBoxElement();
        };

        const stopCropInteraction = () => {
            dragInfo.current.active = false;
            document.removeEventListener('mousemove', handleCropInteractionMove);
            document.removeEventListener('mouseup', stopCropInteraction);
        };
        
        const startCropInteraction = (e: MouseEvent) => {
            if (!isCropModeActive.current) return;
            e.preventDefault();
            e.stopPropagation();
            
            const handle = (e.target as HTMLElement).dataset.handle;
            dragInfo.current = {
                active: true,
                type: handle ? 'resize' : 'move',
                handle: handle || '',
                startX: e.clientX,
                startY: e.clientY,
                startBox: { ...cropState.current }
            };
        
            document.addEventListener('mousemove', handleCropInteractionMove);
            document.addEventListener('mouseup', stopCropInteraction);
        };
        
        const handleAspectRatioChange = (e: Event) => {
            const target = e.currentTarget as HTMLButtonElement;
            const currentlyActive = document.querySelector('#crop-panel .aspect-btn.active');
            
            if (currentlyActive === target) {
                 currentlyActive.classList.remove('active');
                 activeAspectRatio.current = null;
            } else {
                if (currentlyActive) currentlyActive.classList.remove('active');
                target.classList.add('active');
                activeAspectRatio.current = target.dataset.ratio;
                applyAspectRatio();
            }
        };

        const performCrop = () => {
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            if (!isCropModeActive.current || !mainImage.complete || mainImage.naturalWidth === 0) return;
        
            const imageRect = mainImage.getBoundingClientRect();
            const wrapperRect = (document.getElementById('image-wrapper') as HTMLElement).getBoundingClientRect();
            
            const scale = mainImage.naturalWidth / imageRect.width;
        
            const startX = Math.round((cropState.current.x - (imageRect.left - wrapperRect.left)) * scale);
            const startY = Math.round((cropState.current.y - (imageRect.top - wrapperRect.top)) * scale);
            const cropWidth = Math.round(cropState.current.width * scale);
            const cropHeight = Math.round(cropState.current.height * scale);
        
            if (cropWidth <= 0 || cropHeight <= 0) return;
        
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth;
            cropCanvas.height = cropHeight;
            const ctx = cropCanvas.getContext('2d');
        
            ctx.drawImage(
                mainImage,
                startX, startY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );

            const dataUrl = cropCanvas.toDataURL('image/png');

            const cropBox = document.getElementById('crop-box') as HTMLDivElement;
            if (cropBox) cropBox.classList.add('hidden');
            (document.getElementById('crop-image-btn') as HTMLButtonElement).disabled = true;
            (document.getElementById('upscale-image-btn') as HTMLButtonElement).disabled = false;
        
            document.querySelectorAll('#crop-panel .aspect-btn.active').forEach(b => b.classList.remove('active'));
            activeAspectRatio.current = null;
        
            isCropModeActive.current = false;
            
            updateMainImage(dataUrl);
        };
        
        const handleUpscaleAndReframe = async () => {
            const key = window.aistudio ? (window as any).process?.env?.API_KEY : userApiKey.current;
            if (!key) {
                alert("API Key is not available. Please configure it.");
                return;
            }
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
            if (!mainImage.src || mainImage.classList.contains('hidden')) {
                alert("개선할 이미지가 없습니다.");
                return;
            }
            
            const originalImageUrl = mainImage.src;
        
            setIsLoading(true);
            document.getElementById('loader').classList.remove('hidden');
            document.getElementById('main-image').classList.add('hidden');
        
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                const blob = await (await fetch(mainImage.src)).blob();
                if (!blob) throw new Error("Could not create image blob for upscaling.");
        
                const file = new File([blob], 'upscale_image.png', { type: 'image/png' });
                const imagePart = await fileToGenerativePart(file);
                
                const userPrompt = [
                    { text: "Task: Upscale and enhance the provided image. Instructions: 1. Significantly increase the resolution and detail. Aim for the longest side to be approximately 3840 pixels. 2. Improve sharpness, clarity, and remove any compression artifacts. 3. Do NOT change the content, composition, or aspect ratio of the image. The goal is a higher-quality version of the exact same image." },
                    imagePart
                ];
        
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: userPrompt },
                    config: { responseModalities: [Modality.IMAGE] },
                });
        
                const firstPart = response.candidates?.[0]?.content?.parts?.[0];
                if (firstPart && firstPart.inlineData) {
                    const generatedUrl = `data:${firstPart.inlineData.mimeType};base64,${firstPart.inlineData.data}`;
                    showComparisonViewer(originalImageUrl, generatedUrl);
                } else {
                    throw new Error("No image was generated in the response.");
                }
        
            } catch (error) {
                handleApiError(error);
                document.getElementById('main-image').classList.remove('hidden');
            } finally {
                setIsLoading(false);
                document.getElementById('loader').classList.add('hidden');
            }
        };

        const setupCropMode = () => {
            const cropBox = document.getElementById('crop-box') as HTMLDivElement;
            cropBox.addEventListener('mousedown', startCropInteraction);
        
            document.querySelectorAll('#crop-panel .aspect-btn').forEach(btn => {
                btn.addEventListener('click', handleAspectRatioChange);
            });
            document.getElementById('crop-image-btn').addEventListener('click', performCrop);
            document.getElementById('upscale-image-btn').addEventListener('click', handleUpscaleAndReframe);
        };

        const setupCameraMode = () => {
            const cameraCubeContainer = document.getElementById('camera-cube-container') as HTMLElement;
            const cameraCube = document.getElementById('camera-cube') as HTMLElement;
            const verticalSlider = document.getElementById('vertical-slider') as HTMLInputElement;
            const horizontalSlider = document.getElementById('horizontal-slider') as HTMLInputElement;
            const lensSlider = document.getElementById('lens-slider') as HTMLInputElement;
            const verticalSliderValue = document.getElementById('vertical-slider-value') as HTMLElement;
            const horizontalSliderValue = document.getElementById('horizontal-slider-value') as HTMLElement;
            const lensSliderValue = document.getElementById('lens-slider-value') as HTMLElement;
            const invertToggle = document.getElementById('invert-toggle') as HTMLInputElement;
            const resetCameraBtn = document.getElementById('reset-camera-btn') as HTMLButtonElement;
            const cameraGenerateBtn = document.getElementById('camera-generate-btn') as HTMLButtonElement;
        
            if (!cameraCubeContainer || !cameraCube || !verticalSlider || !horizontalSlider || !lensSlider || !verticalSliderValue || !horizontalSliderValue || !lensSliderValue || !invertToggle || !resetCameraBtn || !cameraGenerateBtn) {
                console.error("One or more camera panel elements are missing from the DOM.");
                return;
            }

            let isDragging = false;
            let previousX = 0;
            let previousY = 0;
            let rotationX = 0; // Pitch
            let rotationY = 0; // Yaw
        
            const updateAllSliderValues = () => {
                updateCameraSliderText(verticalSlider, verticalSliderValue);
                updateCameraSliderText(horizontalSlider, horizontalSliderValue);
                updateCameraSliderText(lensSlider, lensSliderValue);
            };
        
            const updateCubeFromSliders = () => {
                rotationX = -parseInt(verticalSlider.value);
                rotationY = parseInt(horizontalSlider.value);
                cameraCube.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`;
            };
        
            const updateSlidersFromCube = () => {
                let horizontalValue = rotationY % 360;
                if (horizontalValue > 180) horizontalValue -= 360;
                if (horizontalValue < -180) horizontalValue += 360;
        
                verticalSlider.value = String(-rotationX);
                horizontalSlider.value = String(horizontalValue);
        
                updateAllSliderValues();
            };
        
            const onMouseDown = (e: MouseEvent) => {
                e.preventDefault();
                isDragging = true;
                previousX = e.clientX;
                previousY = e.clientY;
                cameraCubeContainer.classList.add('grabbing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
        
            const onMouseMove = (e: MouseEvent) => {
                if (!isDragging) return;
                const dx = e.clientX - previousX;
                const dy = e.clientY - previousY;
                const invertFactor = invertToggle.checked ? -1 : 1;
        
                rotationY += dx * 0.5 * invertFactor;
                rotationX -= dy * 0.5 * invertFactor;
        
                rotationX = Math.max(-90, Math.min(90, rotationX)); // Clamp vertical rotation
        
                cameraCube.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`;
                updateSlidersFromCube();
        
                previousX = e.clientX;
                previousY = e.clientY;
            };
        
            const onMouseUp = () => {
                isDragging = false;
                cameraCubeContainer.classList.remove('grabbing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
        
            const resetCameraState = () => {
                verticalSlider.value = '0';
                horizontalSlider.value = '0';
                lensSlider.value = '50';
                invertToggle.checked = false;
                updateCubeFromSliders();
                updateAllSliderValues();
            };
        
            cameraCubeContainer.addEventListener('mousedown', onMouseDown);
            verticalSlider.addEventListener('input', () => { updateCubeFromSliders(); updateCameraSliderText(verticalSlider, verticalSliderValue); });
            horizontalSlider.addEventListener('input', () => { updateCubeFromSliders(); updateCameraSliderText(horizontalSlider, horizontalSliderValue); });
            lensSlider.addEventListener('input', () => updateCameraSliderText(lensSlider, lensSliderValue));
            resetCameraBtn.addEventListener('click', resetCameraState);
            cameraGenerateBtn.addEventListener('click', handleCameraGenerate);
        
            resetCameraState();
        };

        const setupLightMode = () => {
            const lightPanel = document.getElementById('light-panel');
            if (!lightPanel) return;
        
            const presetsContainer = document.getElementById('light-presets') as HTMLElement;
            const lightCanvas = document.getElementById('light-canvas') as HTMLElement;
            const lightHandle = document.getElementById('light-handle') as HTMLElement;
            const lightOverlay = document.getElementById('light-overlay') as HTMLElement;
            const mainImage = document.getElementById('main-image') as HTMLImageElement;
        
            const intensitySlider = document.getElementById('light-intensity') as HTMLInputElement;
            const tempSlider = document.getElementById('light-temp') as HTMLInputElement;
            const hardnessSlider = document.getElementById('light-hardness') as HTMLInputElement;
            const colorInput = document.getElementById('light-color') as HTMLInputElement;
            const typeSelect = document.getElementById('light-type') as HTMLSelectElement;
        
            const intensityValueEl = document.getElementById('light-intensity-value');
            const tempValueEl = document.getElementById('light-temp-value');
            const hardnessValueEl = document.getElementById('hardness-value');
        
            const resetBtn = document.getElementById('reset-light-btn') as HTMLButtonElement;
        
            // Guard against missing elements to prevent crashes
            if (!presetsContainer || !lightCanvas || !lightHandle || !lightOverlay || !mainImage ||
                !intensitySlider || !tempSlider || !hardnessSlider || !colorInput || !typeSelect ||
                !intensityValueEl || !tempValueEl || !hardnessValueEl || !resetBtn) {
                console.error("One or more light panel elements are missing from the DOM.");
                return;
            }
        
            const lightState = {
                x: 0, y: 0, intensity: 100, temp: 5500, hardness: 50,
                color: '#FFFFFF', type: 'Point',
            };
        
            const updateUIFromState = () => {
                intensitySlider.value = String(lightState.intensity);
                tempSlider.value = String(lightState.temp);
                hardnessSlider.value = String(lightState.hardness);
                colorInput.value = lightState.color;
                typeSelect.value = lightState.type;
        
                intensityValueEl.textContent = `${lightState.intensity}%`;
                tempValueEl.textContent = `${lightState.temp}K`;
                hardnessValueEl.textContent = `${lightState.hardness}%`;
        
                const canvasRect = lightCanvas.getBoundingClientRect();
                if (canvasRect.width > 0) {
                    const handleX = (lightState.x * (canvasRect.width / 2)) + (canvasRect.width / 2);
                    const handleY = (lightState.y * (canvasRect.height / 2)) + (canvasRect.height / 2);
                    lightHandle.style.left = `${handleX}px`;
                    lightHandle.style.top = `${handleY}px`;
                }
        
                const imageWrapper = document.getElementById('image-wrapper');
                if (mainImage.src && !mainImage.classList.contains('hidden') && imageWrapper) {
                    const imageRect = mainImage.getBoundingClientRect();
                    const wrapperRect = imageWrapper.getBoundingClientRect();
                    
                    lightOverlay.style.width = `${imageRect.width}px`;
                    lightOverlay.style.height = `${imageRect.height}px`;
                    lightOverlay.style.top = `${imageRect.top - wrapperRect.top}px`;
                    lightOverlay.style.left = `${imageRect.left - wrapperRect.left}px`;
                    
                    const gradientX = (lightState.x * -50) + 50;
                    const gradientY = (lightState.y * -50) + 50;
                    const hardnessStop = 100 - lightState.hardness;
                    
                    lightOverlay.style.background = `radial-gradient(circle at ${gradientX}% ${gradientY}%, transparent ${hardnessStop}%, rgba(0,0,0,0.5) 100%)`;
                    lightOverlay.style.opacity = `${lightState.intensity / 200}`;
                } else {
                    lightOverlay.style.opacity = '0';
                }
            };
        
            intensitySlider.addEventListener('input', () => { lightState.intensity = parseInt(intensitySlider.value); updateUIFromState(); });
            tempSlider.addEventListener('input', () => { lightState.temp = parseInt(tempSlider.value); updateUIFromState(); });
            hardnessSlider.addEventListener('input', () => { lightState.hardness = parseInt(hardnessSlider.value); updateUIFromState(); });
            colorInput.addEventListener('input', () => { lightState.color = colorInput.value; updateUIFromState(); });
            typeSelect.addEventListener('change', () => { lightState.type = typeSelect.value; updateUIFromState(); });
        
            let isDragging = false;
            const onMouseDown = (e: MouseEvent) => {
                e.preventDefault();
                isDragging = true;
                lightHandle.classList.add('grabbing');
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            };
            const onMouseMove = (e: MouseEvent) => {
                if (!isDragging) return;
                const rect = lightCanvas.getBoundingClientRect();
                let x = e.clientX - rect.left;
                let y = e.clientY - rect.top;
                x = Math.max(0, Math.min(rect.width, x));
                y = Math.max(0, Math.min(rect.height, y));
                lightState.x = ((x / rect.width) * 2) - 1;
                lightState.y = ((y / rect.height) * 2) - 1;
                updateUIFromState();
            };
            const onMouseUp = () => {
                isDragging = false;
                lightHandle.classList.remove('grabbing');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };
            lightHandle.addEventListener('mousedown', onMouseDown);
        
            const resetLightState = () => {
                lightState.x = 0; lightState.y = -0.8; lightState.intensity = 100;
                lightState.temp = 5500; lightState.hardness = 50; lightState.color = '#FFFFFF';
                lightState.type = 'Point';
                const activePreset = presetsContainer.querySelector('.preset-btn.active');
                if (activePreset) activePreset.classList.remove('active');
                updateUIFromState();
            };
            resetBtn.addEventListener('click', resetLightState);
            
            presetsContainer.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const presetBtn = target.closest('.preset-btn') as HTMLButtonElement;
                if (!presetBtn) return;
                
                document.querySelectorAll('#light-presets .preset-btn.active').forEach(b => b.classList.remove('active'));
                presetBtn.classList.add('active');
        
                const preset = presetBtn.dataset.preset;
                switch (preset) {
                    case 'daylight': lightState.x = 0.5; lightState.y = -0.8; lightState.intensity = 120; lightState.temp = 5800; lightState.hardness = 70; lightState.color = '#FFFFFF'; break;
                    case 'golden-hour': lightState.x = -0.9; lightState.y = 0.2; lightState.intensity = 80; lightState.temp = 3500; lightState.hardness = 30; lightState.color = '#FFD7A9'; break;
                    case 'studio': lightState.x = -0.6; lightState.y = -0.6; lightState.intensity = 150; lightState.temp = 5000; lightState.hardness = 80; lightState.color = '#FFFFFF'; break;
                    case 'rim': lightState.x = 0.8; lightState.y = -0.3; lightState.intensity = 180; lightState.temp = 6500; lightState.hardness = 90; lightState.color = '#FFFFFF'; break;
                    case 'horror': lightState.x = 0; lightState.y = 0.9; lightState.intensity = 70; lightState.temp = 4000; lightState.hardness = 20; lightState.color = '#B2EBF2'; break;
                    case 'mono': lightState.x = -0.7; lightState.y = -0.5; lightState.intensity = 110; lightState.temp = 7000; lightState.hardness = 60; lightState.color = '#FFFFFF'; break;
                    case 'fantasy': lightState.x = 0.6; lightState.y = 0.6; lightState.intensity = 130; lightState.temp = 8000; lightState.hardness = 40; lightState.color = '#E1BEE7'; break;
                    case 'cinematic': lightState.x = -0.8; lightState.y = -0.2; lightState.intensity = 90; lightState.temp = 4500; lightState.hardness = 50; lightState.color = '#FFCC80'; break;
                }
                updateUIFromState();
            });
        
            resetLightState();
        
            const observer = new MutationObserver(() => {
               const imageVisible = mainImage && mainImage.src && !mainImage.classList.contains('hidden');
               const lightPanelVisible = lightPanel && !lightPanel.classList.contains('hidden');
               if (lightOverlay) lightOverlay.style.display = (imageVisible && lightPanelVisible) ? 'block' : 'none';
               if (imageVisible && lightPanelVisible) updateUIFromState();
            });
            
            observer.observe(mainImage, { attributes: true, attributeFilter: ['class', 'src'] });
            observer.observe(lightPanel, { attributes: true, attributeFilter: ['class'] });
        };

        const handleGenerate = async () => {
            const key = window.aistudio ? (window as any).process?.env?.API_KEY : userApiKey.current;
            if (!key) {
                alert("API Key is not available. Please configure it.");
                return;
            }
            const subjectParts = await Promise.all(imageSources.current.subject.filter(f => f).map(fileToGenerativePart));
            const sceneParts = await Promise.all(imageSources.current.scene.filter(f => f).map(fileToGenerativePart));
            const styleParts = await Promise.all(imageSources.current.style.filter(f => f).map(fileToGenerativePart));

            if (sceneParts.length === 0 || subjectParts.length === 0) {
                alert("피사체와 장면 이미지를 최소 하나씩 업로드해야 합니다.");
                return;
            }

            setIsLoading(true);
            document.getElementById('loader').classList.remove('hidden');
            document.getElementById('placeholder-content').classList.add('hidden');
            document.getElementById('main-image').classList.add('hidden');
            
            const promptInput = (document.getElementById('prompt-input') as HTMLInputElement).value;
            
            type PromptPart = { text: string } | { inlineData: { data: string; mimeType: string; } };
            
            let userPrompt: PromptPart[] = [
                { text: "Generate a new, complete illustration based on the following elements." },
                { text: "CRITICAL: The final image must not contain any text, subtitles, captions, logos, or watermarks of any kind. This is a strict requirement." }
            ];

            // SUBJECT
            userPrompt.push({ text: "\n---SUBJECT---" });
            if (subjectParts.length > 1) {
                userPrompt.push({ text: "CRITICAL INSTRUCTION FOR SUBJECT: Multiple subject images are provided. You must synthesize them as follows:" });
                userPrompt.push({ text: "1. POSE REFERENCE: Identify the image(s) that define the subject's POSE (e.g., a 3D model)." });
                userPrompt.push({ text: "2. CHARACTER REFERENCE: Identify the image(s) that define the CHARACTER's appearance (e.g., an anime character). This is the primary reference for the final subject's look, clothing, and style." });
                userPrompt.push({ text: "TASK: Draw the CHARACTER from the character reference(s), but put them in the POSE from the pose reference(s). The final result must be the specified CHARACTER performing the specified POSE." });
            } else {
                userPrompt.push({ text: "The main subject of the image should be based on this subject image. Pay attention to the pose, character design, and objects." });
            }
            userPrompt.push(...subjectParts);

            // SCENE
            userPrompt.push({ text: "\n---SCENE COMPOSITION---" });
            userPrompt.push({ text: "IMPORTANT: Use the following scene image(s) ONLY as a reference for the background layout, object placement, and overall mood. DO NOT use the photo directly. You MUST redraw the entire scene from scratch in the specified art style." });
            userPrompt.push(...sceneParts);

            // STYLE
            if (styleParts.length > 0) {
                userPrompt.push({ text: "\n---ART STYLE---" });
                userPrompt.push({ text: "CRITICAL: The final image's art style (line work, coloring, texture, etc.) MUST strictly match the style of this/these reference image(s). This is the most important instruction." });
                userPrompt.push(...styleParts);
            } else {
                 userPrompt.push({ text: "\n---ART STYLE---" });
                 userPrompt.push({ text: "CRITICAL: No specific style image was provided. Therefore, you must derive the art style from the provided SUBJECT image(s). If both pose and character references are given for the subject, the CHARACTER reference is the definitive art style. Apply this style to the entire final image, including the redrawn background." });
            }

            if (promptInput) {
                userPrompt.push({ text: "\n---USER'S PROMPT---" });
                userPrompt.push({ text: `Based on all the provided image references, create an image that also incorporates the following request: "${promptInput}"` });
            }
            
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: userPrompt },
                    config: {
                      responseModalities: [Modality.IMAGE],
                    },
                });

                const firstPart = response.candidates?.[0]?.content?.parts?.[0];
                if (firstPart && firstPart.inlineData) {
                    const base64Image = firstPart.inlineData.data;
                    const imageUrl = `data:${firstPart.inlineData.mimeType};base64,${base64Image}`;
                    updateMainImage(imageUrl);
                } else {
                    throw new Error("No image was generated in the response.");
                }

            } catch (error) {
                handleApiError(error);
                document.getElementById('placeholder-content').classList.remove('hidden');
            } finally {
                setIsLoading(false);
                document.getElementById('loader').classList.add('hidden');
            }
        };

        const handleComposeScene = async () => {
            const key = window.aistudio ? (window as any).process?.env?.API_KEY : userApiKey.current;
            if (!key) {
                alert("API Key is not available. Please configure it.");
                return;
            }
            const characterParts = await Promise.all(imageSources.current.characters.filter(f => f).map(fileToGenerativePart));
            const backgroundParts = await Promise.all(imageSources.current.background.filter(f => f).map(fileToGenerativePart));

             if (characterParts.length === 0 || backgroundParts.length === 0) {
                alert("등장인물과 배경 이미지를 최소 하나씩 업로드해야 합니다.");
                return;
            }

            setIsLoading(true);
            document.getElementById('loader').classList.remove('hidden');
            document.getElementById('placeholder-content').classList.add('hidden');
            document.getElementById('main-image').classList.add('hidden');

            const promptInput = (document.getElementById('compose-prompt-input') as HTMLInputElement).value;

            type PromptPart = { text: string } | { inlineData: { data: string; mimeType: string; } };
            
            let userPrompt: PromptPart[] = [
                { text: "You are a scene composition expert. Your task is to composite characters into a background scene based on user-provided images and annotations." },
                { text: "CRITICAL: The final image must not contain any text, subtitles, captions, logos, or watermarks of any kind." }
            ];

            // CHARACTERS (Numbered)
            userPrompt.push({ text: "\n---CHARACTERS---" });
            userPrompt.push({ text: "This section defines the characters to be placed in the scene. Each character is individually numbered." });
            characterParts.forEach((part, index) => {
                userPrompt.push({ text: `This is Character #${index + 1}.` });
                userPrompt.push(part);
            });

            // BACKGROUND & ANNOTATIONS
            userPrompt.push({ text: "\n---BACKGROUND & COMPOSITION GUIDE---" });
            userPrompt.push({ text: "This is the background image. It contains numbered annotations (e.g., text that says '1', '2') indicating where each character should be placed." });
            userPrompt.push(...backgroundParts);

            // CRITICAL RULE
            userPrompt.push({ text: "\n---ABSOLUTELY CRITICAL COMPOSITION RULE---" });
            userPrompt.push({ text: "You MUST place each numbered character from the 'CHARACTERS' section into the corresponding numbered location on the 'BACKGROUND' image. For example, 'Character #1' goes to the location marked '1'. 'Character #2' goes to the location marked '2', and so on. This character order is ABSOLUTE and MUST NOT be changed, swapped, or ignored under any circumstances, even if the user provides new text prompts later. Adhere to the annotations precisely for placement and integrate the characters naturally." });

            if (promptInput) {
                userPrompt.push({ text: "\n---ADDITIONAL INSTRUCTIONS---" });
                userPrompt.push({ text: `In addition to the visual guide, follow this instruction: "${promptInput}"` });
            }


             try {
                const ai = new GoogleGenAI({ apiKey: key });
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image',
                    contents: { parts: userPrompt },
                    config: {
                      responseModalities: [Modality.IMAGE],
                    },
                });

                const firstPart = response.candidates?.[0]?.content?.parts?.[0];
                if (firstPart && firstPart.inlineData) {
                    const base64Image = firstPart.inlineData.data;
                    const imageUrl = `data:${firstPart.inlineData.mimeType};base64,${base64Image}`;
                    updateMainImage(imageUrl);
                } else {
                    throw new Error("No image was generated in the response.");
                }

            } catch (error) {
                handleApiError(error);
                document.getElementById('placeholder-content').classList.remove('hidden');
            } finally {
                setIsLoading(false);
                document.getElementById('loader').classList.add('hidden');
            }
        };


        setupAllListeners();
        // Set initial character number
        const firstCharNumber = document.querySelector('.char-number');
        if(firstCharNumber) firstCharNumber.textContent = '1';
    }, []);

    return null; 
};

const container = document.getElementById('root');
if (!container) {
    const dummyRoot = document.createElement('div');
    dummyRoot.id = 'root';
    document.body.appendChild(dummyRoot);
    const root = createRoot(dummyRoot);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
} else {
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
}
