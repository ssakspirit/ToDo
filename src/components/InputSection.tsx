import React, { useRef } from 'react';
import { Upload, MessageSquare, Sparkles, Camera, Plus, X, Loader2 } from 'lucide-react';

export interface Attachment {
  id: string;
  file: File;
  previewUrl: string; // 압축된 data URL (미리보기 + AI 분석 전송 공용)
  mimeType: string;   // 압축 시 image/jpeg로 바뀔 수 있어 file.type과 별도 보관
}

interface InputSectionProps {
  inputText: string;
  onInputChange: (text: string) => void;
  attachments: Attachment[];
  onAddFiles: (files: FileList) => void;
  onRemoveAttachment: (id: string) => void;
  onClear: () => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  errorMsg: string | null;
}

const isImageFile = (file: File) => file.type.startsWith('image/');

// 텍스트 입력 + 이미지/파일 첨부 + 분석 버튼
const InputSection: React.FC<InputSectionProps> = ({
  inputText,
  onInputChange,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  onClear,
  onAnalyze,
  isAnalyzing,
  errorMsg,
}) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 파일 선택·카메라 촬영 공용 — 같은 파일을 다시 고를 수 있도록 값 초기화
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
    e.target.value = '';
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50 p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Text Input */}
        <div className="flex flex-col h-full">
          <label className="mb-2 flex items-center">
            <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-600" />
          </label>
          <textarea
            className="flex-1 min-h-[12rem] w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/50 rounded-lg focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 focus:border-transparent outline-none resize-none text-sm leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-600"
            placeholder="여기에 입력"
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
          />
        </div>

        {/* File Input */}
        <div className="flex flex-col h-full">
          <label className="mb-2 flex items-center">
            <Camera className="w-4 h-4 text-slate-400 dark:text-slate-600" />
          </label>
          <div className="relative flex-1 min-h-[12rem] flex flex-col">
            <div
              className={`flex-1 border border-dashed rounded-lg p-3 transition-colors ${
                attachments.length > 0
                  ? 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {attachments.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="relative aspect-square group/item"
                    >
                      <div className="w-full h-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center">
                        {isImageFile(att.file) ? (
                          <img
                            src={att.previewUrl}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-2 text-center">
                            <Upload className="w-8 h-8 text-slate-400 mb-1" />
                            <span className="text-[10px] text-slate-500 truncate w-full px-1">
                              {att.file.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          onRemoveAttachment(att.id);
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-white dark:hover:bg-slate-800 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-indigo-500 transition-colors"
                  >
                    <Plus className="w-6 h-6 mb-1" />
                    <span className="text-xs font-bold">추가</span>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors z-10"
                  >
                    <Camera className="w-10 h-10 text-slate-400 dark:text-slate-600" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileInput}
                className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${
                  attachments.length > 0 ? 'hidden' : 'z-0'
                }`}
              />
            </div>
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleFileInput}
              className="hidden"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        {(inputText || attachments.length > 0) && (
          <button
            onClick={onClear}
            className="p-2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
            title="초기화"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onAnalyze}
          disabled={isAnalyzing}
          className="p-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:bg-slate-400 text-white dark:text-slate-900 rounded-lg transition-colors flex items-center justify-center"
          title={isAnalyzing ? "분석 중..." : "분석하기"}
        >
          {isAnalyzing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/30">
          {errorMsg}
        </div>
      )}
    </section>
  );
};

export default InputSection;
