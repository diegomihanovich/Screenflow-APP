import React, { useState } from 'react';
import { Recording } from '../types';
import { Button } from './ui/Button';
import { formatDate, formatDuration } from '../utils/format';
import { 
  Plus, 
  Search, 
  Trash2, 
  Download, 
  Play, 
  Video,
  Film,
  User, // Importamos el icono User
  FolderOpen
} from 'lucide-react';

interface DashboardProps {
  recordings: Recording[];
  onNewRecording: () => void;
  onSelectRecording: (rec: Recording) => void;
  onDeleteRecording: (id: string) => void;

  /** Optional: filesystem-backed library folder (File System Access API). */
  libraryFolderName?: string | null;
  onChooseLibraryFolder?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  recordings, 
  onNewRecording, 
  onSelectRecording,
  onDeleteRecording,
  libraryFolderName = null,
  onChooseLibraryFolder
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRecordings = recordings.filter(rec => 
    rec.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {/* Modern Glass Header */}
      <header className="glass sticky top-0 z-20 px-6 py-4 border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 select-none">
            <div className="bg-gradient-to-tr from-tech-600 to-tech-400 p-2.5 rounded-xl shadow-glow text-white">
              <Video size={20} fill="currentColor" className="text-white/90" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
              ScreenFlow <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono uppercase border border-slate-200">Beta</span>
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
              {/* Profile */}
            <div className="hidden sm:flex items-center gap-3 pr-4 border-r border-slate-200">
                <div className="text-right">
                    <p className="text-xs font-semibold text-slate-800">Usuario Demo</p>
                    <p className="text-[10px] text-slate-500">Free Plan</p>
                </div>
                {/* Updated Avatar Placeholder */}
                <div className="w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm ring-1 ring-slate-100">
                    <User size={18} />
                </div>
             </div>
            {onChooseLibraryFolder && (
              <Button
                variant="secondary"
                onClick={onChooseLibraryFolder}
                icon={<FolderOpen size={18} />}
                title={libraryFolderName ? `Carpeta: ${libraryFolderName}` : 'Seleccionar carpeta de biblioteca'}
              >
                {libraryFolderName ? libraryFolderName : 'Elegir carpeta'}
              </Button>
            )}
            <Button onClick={onNewRecording} icon={<Plus size={18} />} className="shadow-tech-500/20">
              Nueva grabación
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Controls & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
            <div>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight mb-1">Biblioteca</h2>
                <p className="text-slate-500 text-sm">Gestiona y organiza tus capturas de pantalla.</p>
            </div>
            
            <div className="relative group w-full md:w-80">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-tech-300 to-tech-100 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-200"></div>
              <div className="relative bg-white rounded-xl flex items-center border border-slate-200 shadow-sm">
                  <Search className="ml-3 text-slate-400" size={18} />
                  <input 
                    type="text" 
                    placeholder="Buscar grabaciones..." 
                    className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-700 placeholder-slate-400 focus:outline-none"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
            </div>
          </div>

          {/* Grid Layout */}
          {recordings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
              <div className="w-20 h-20 bg-white rounded-full shadow-subtle flex items-center justify-center mb-6 animate-float">
                <Film size={32} className="text-tech-500" />
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-2">Tu biblioteca está vacía</h3>
              <p className="text-slate-500 mb-8 max-w-sm text-center text-sm leading-relaxed">
                Aún no has creado ningún video. Empieza a grabar tu pantalla para compartir ideas más rápido.
              </p>
              <Button onClick={onNewRecording} size="lg" icon={<Video size={18} />}>
                Grabar mi primer video
              </Button>
            </div>
          ) : filteredRecordings.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              No se encontraron videos que coincidan con "{searchTerm}"
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredRecordings.map((rec) => (
                <div 
                    key={rec.id} 
                    className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-slate-200/50 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col h-full"
                    onClick={() => onSelectRecording(rec)}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                    
                    {/* Placeholder Pattern */}
                    {rec.thumbnailUrl ? (
                      <img
                        src={rec.thumbnailUrl}
                        alt={`Miniatura de ${rec.title}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-50 group-hover:scale-105 transition-transform duration-500">
                        <div className="w-12 h-12 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-lg text-tech-600">
                          <Play size={20} fill="currentColor" className="ml-1" />
                        </div>
                      </div>
                    )}

                    <span className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-medium px-2 py-0.5 rounded-md z-20">
                      {formatDuration(rec.duration)}
                    </span>
                  </div>

                  {/* Card Content */}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-1 gap-2">
                      <h3 className="font-semibold text-slate-900 truncate flex-1 text-sm group-hover:text-tech-600 transition-colors" title={rec.title}>
                        {rec.title}
                      </h3>
                      <button className="text-slate-300 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => { e.stopPropagation(); onDeleteRecording(rec.id); }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    
                    <p className="text-xs text-slate-400 font-medium mb-4">{formatDate(rec.createdAt)}</p>
                    
                    <div className="mt-auto pt-3 border-t border-slate-50 flex items-center justify-between text-xs">
                         <span className="text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">WebM</span>
                         <button 
                            className="flex items-center gap-1.5 text-tech-600 font-medium hover:underline opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-200"
                            onClick={(e) => {
                                e.stopPropagation();
                                const url = URL.createObjectURL(rec.blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `${rec.title}.webm`;
                                a.click();
                            }}
                         >
                            <Download size={12} /> Descargar
                         </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
