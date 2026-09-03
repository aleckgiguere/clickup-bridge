import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Clock, 
  X, 
  Check, 
  Calendar, 
  ArrowRight, 
  Sparkles, 
  Hash, 
  Timer,
  ChevronRight
} from 'lucide-react';
import { ClickUpTask } from '../types';
import { formatTimerClock } from '../utils/formatters';

interface PunchTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: ClickUpTask | null;
  activeTimer: {
    isRunning: boolean;
    taskId?: string;
    taskName: string;
    elapsedSeconds: number;
  } | null;
  onStartLiveTimer: (taskId: string, taskName: string, description?: string) => Promise<void>;
  onStopLiveTimer: () => Promise<void>;
  onAddIntervalPunch: (
    taskId: string, 
    startMs: number, 
    endMs: number, 
    description?: string,
    billable?: boolean
  ) => Promise<void>;
}

/**
 * Analyse une entrée de durée saisie au clavier.
 * Formats acceptés :
 * - Chiffres décimaux : 1.5, 1,5, 2, 0.75, 0.25, 3.25
 * - Formats textuels : 1h30, 1h 30m, 2h, 45m, 90m
 * - Format horodaté : 1:30, 2:15
 * Retourne le nombre total de minutes (entier >= 0).
 */
export function parseDurationInputToMinutes(input: string): number {
  if (!input) return 0;
  const cleaned = input.trim().replace(',', '.');

  // Cas 1: Nombre décimal (ex: "1.5", "2", "0.75")
  const num = parseFloat(cleaned);
  if (!isNaN(num) && /^-?\d+(\.\d+)?$/.test(cleaned)) {
    return Math.max(0, Math.round(num * 60));
  }

  // Cas 2: Format "1h30", "1h 30m", "2h", "45m"
  const hourMinMatch = cleaned.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:eures?)?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/i);
  if (hourMinMatch && (hourMinMatch[1] || hourMinMatch[2])) {
    const h = hourMinMatch[1] ? parseFloat(hourMinMatch[1]) : 0;
    const m = hourMinMatch[2] ? parseInt(hourMinMatch[2], 10) : 0;
    return Math.max(0, Math.round(h * 60 + m));
  }

  // Cas 3: Format horodaté "1:30"
  const colonMatch = cleaned.match(/^(\d+):([0-5]?\d)$/);
  if (colonMatch) {
    const h = parseInt(colonMatch[1], 10);
    const m = parseInt(colonMatch[2], 10);
    return Math.max(0, h * 60 + m);
  }

  return 0;
}

export function formatMinutesFriendly(minutes: number): string {
  if (minutes <= 0) return '0 min';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} h ${m.toString().padStart(2, '0')} min`;
  if (h > 0) return `${h} h`;
  return `${m} min`;
}

export const PunchTimeModal: React.FC<PunchTimeModalProps> = ({
  isOpen,
  onClose,
  task,
  activeTimer,
  onStartLiveTimer,
  onStopLiveTimer,
  onAddIntervalPunch,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Saisie mode : 'direct' (taper un chiffre en heures ex: 1.5) ou 'interval' (heures début / fin)
  const [entryMode, setEntryMode] = useState<'direct' | 'interval'>('direct');

  // Mode Direct : chiffre tapé au clavier
  const [directHoursInput, setDirectHoursInput] = useState<string>('1.5');
  const directInputRef = useRef<HTMLInputElement>(null);

  // Mode Intervalle : Heure de début et Heure de fin tapées directement (ex: "09:00", "11:30")
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('11:30');

  const [description, setDescription] = useState<string>('');
  const [isBillable, setIsBillable] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Initialisation à l'ouverture
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const currentH = now.getHours();
      const currentM = Math.floor(now.getMinutes() / 5) * 5;
      
      const endStr = `${currentH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;
      
      const startD = new Date(now.getTime() - 60 * 60 * 1000);
      const startH = startD.getHours();
      const startStr = `${startH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;

      setEndTime(endStr);
      setStartTime(startStr);
      setSelectedDate(new Date().toISOString().split('T')[0]);
      setDescription('');
      setIsBillable(true);
      setSuccessMessage(null);

      // Focus automatique sur le champ de saisie directe d'heures
      setTimeout(() => {
        if (directInputRef.current) {
          directInputRef.current.focus();
          directInputRef.current.select();
        }
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const isCurrentTaskRunning = activeTimer?.isRunning && activeTimer.taskId === task.id;

  // Calcul pour le mode direct
  const parsedDirectMinutes = parseDurationInputToMinutes(directHoursInput);
  const directDurationLabel = formatMinutesFriendly(parsedDirectMinutes);

  // Calcul pour le mode intervalle
  const calculateIntervalDuration = () => {
    const [sH, sM] = startTime.split(':').map(Number);
    const [eH, eM] = endTime.split(':').map(Number);
    if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return 0;

    let diffMinutes = (eH * 60 + eM) - (sH * 60 + sM);
    if (diffMinutes <= 0) {
      // Si minuit dépassé
      diffMinutes += 24 * 60;
    }
    return diffMinutes;
  };

  const intervalMinutes = calculateIntervalDuration();
  const intervalDurationLabel = formatMinutesFriendly(intervalMinutes);

  // Soumission de l'enregistrement de temps
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let diffMinutes = 0;
    let startTimestamp = 0;
    let endTimestamp = 0;
    const [year, month, day] = selectedDate.split('-').map(Number);

    if (entryMode === 'direct') {
      diffMinutes = parsedDirectMinutes;
      if (diffMinutes <= 0) {
        alert('Veuillez inscrire un chiffre d’heures valide (ex: 1.5 ou 2 ou 0.75).');
        return;
      }

      const isToday = selectedDate === todayStr;
      if (isToday) {
        // Travail terminé maintenant
        endTimestamp = Date.now();
      } else {
        // Autre jour : fin standard à 17h00
        endTimestamp = new Date(year, month - 1, day, 17, 0, 0, 0).getTime();
      }
      startTimestamp = endTimestamp - (diffMinutes * 60 * 1000);
    } else {
      // Mode Intervalle Début / Fin
      diffMinutes = intervalMinutes;
      if (diffMinutes <= 0) {
        alert('Veuillez entrer une heure de fin supérieure à l’heure de début.');
        return;
      }

      const [sH, sM] = startTime.split(':').map(Number);
      const [eH, eM] = endTime.split(':').map(Number);
      const startDate = new Date(year, month - 1, day, sH, sM, 0, 0);
      let endDate = new Date(year, month - 1, day, eH, eM, 0, 0);

      if (endDate.getTime() <= startDate.getTime()) {
        endDate = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);
      }
      startTimestamp = startDate.getTime();
      endTimestamp = endDate.getTime();
    }

    const durationLabel = entryMode === 'direct' ? directDurationLabel : intervalDurationLabel;

    setIsSubmitting(true);
    try {
      await onAddIntervalPunch(task.id, startTimestamp, endTimestamp, description, isBillable);
      setSuccessMessage(`Temps enregistré : ${durationLabel} dans ClickUp !`);
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(`Erreur: ${err.message || 'Impossible d’enregistrer le temps dans ClickUp'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleTimer = async () => {
    setIsSubmitting(true);
    try {
      if (isCurrentTaskRunning) {
        await onStopLiveTimer();
        setSuccessMessage('Chronomètre arrêté et enregistré dans ClickUp !');
      } else {
        await onStartLiveTimer(task.id, task.name, description);
        setSuccessMessage('Chronomètre démarré dans ClickUp !');
      }
      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    } catch (err: any) {
      alert(`Erreur: ${err.message || 'Erreur chrono'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Raccourcis rapides de durée (boutons)
  const quickDurationPresets = [
    { label: '15 min', val: '0.25' },
    { label: '30 min', val: '0.5' },
    { label: '45 min', val: '0.75' },
    { label: '1h', val: '1' },
    { label: '1h30', val: '1.5' },
    { label: '2h', val: '2' },
    { label: '3h', val: '3' },
    { label: '4h', val: '4' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-white/10">
        
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <span className="font-bold text-sm text-slate-100">Enregistrer du temps (Punch)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          
          {/* Target Task info */}
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <div className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">Tâche Ciblée</div>
            <div className="font-bold text-sm text-slate-100 mt-0.5">{task.name}</div>
            
            {task.parentName && (
              <div className="text-xs text-purple-300 font-medium mt-0.5 flex items-center space-x-1">
                <span>↳ Sous-tâche de :</span>
                <span className="font-semibold">{task.parentName}</span>
              </div>
            )}

            <div className="text-[11px] text-slate-400 mt-1 truncate">
              {task.folder?.name ? `${task.folder.name} / ` : ''}{task.list.name}
            </div>
          </div>

          {/* Success toast inside modal */}
          {successMessage && (
            <div className="p-3 bg-emerald-950/90 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Chrono en direct */}
          <div>
            <button
              type="button"
              onClick={handleToggleTimer}
              disabled={isSubmitting}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow-md ${
                isCurrentTaskRunning
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 ring-2 ring-red-400/50'
                  : 'bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-200'
              }`}
            >
              {isCurrentTaskRunning ? (
                <>
                  <Square className="w-4 h-4 fill-current animate-pulse text-white" />
                  <span>Arrêter le chrono en direct ({formatTimerClock(activeTimer?.elapsedSeconds || 0)})</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-purple-400" />
                  <span>Démarrer le chronomètre en direct</span>
                </>
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[10px] uppercase font-bold text-slate-500 tracking-wider absolute">
              OU SAISIE MANUELLE
            </span>
          </div>

          {/* Mode Switcher: Taper un chiffre en heures VS Plage horaire */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                setEntryMode('direct');
                setTimeout(() => directInputRef.current?.focus(), 50);
              }}
              className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                entryMode === 'direct'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Hash className="w-3.5 h-3.5" />
              <span>Taper les heures</span>
            </button>

            <button
              type="button"
              onClick={() => setEntryMode('interval')}
              className={`py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition-all ${
                entryMode === 'interval'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Timer className="w-3.5 h-3.5" />
              <span>Début & Fin</span>
            </button>
          </div>

          {/* Saisie Formulaire */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Date selector */}
            <div className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-2 text-xs font-semibold text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-purple-400" />
                <span>Date du punch :</span>
              </div>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
              />
            </div>

            {/* OPTION A: SAISIE DIRECTE DU CHIFFRE D'HEURES (TAPÉ AU CLAVIER) */}
            {entryMode === 'direct' && (
              <div className="space-y-3">
                
                <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800 space-y-3">
                  <label 
                    htmlFor="direct-hours-input"
                    className="block text-xs font-bold text-slate-300"
                  >
                    Nombre d'heures travaillées :
                  </label>

                  <div className="relative flex items-center">
                    <input
                      id="direct-hours-input"
                      ref={directInputRef}
                      type="text"
                      inputMode="decimal"
                      value={directHoursInput}
                      onChange={(e) => setDirectHoursInput(e.target.value)}
                      placeholder="ex: 1.5 ou 2 ou 0.75"
                      className="w-full bg-slate-900 border-2 border-purple-500/60 focus:border-purple-400 rounded-xl px-4 py-2.5 text-lg font-bold text-white placeholder-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-purple-500/30 transition-all"
                    />
                    <span className="absolute right-4 font-mono font-bold text-purple-300 text-sm pointer-events-none">
                      heures
                    </span>
                  </div>

                  {/* Visual live conversion preview */}
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-400 font-medium">Temps calculé :</span>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded ${
                      parsedDirectMinutes > 0 ? 'bg-purple-900/50 text-purple-300 border border-purple-700/50' : 'text-slate-500'
                    }`}>
                      {parsedDirectMinutes > 0 ? `${directDurationLabel} (${parsedDirectMinutes} min)` : '0 min'}
                    </span>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="pt-1">
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-1.5 tracking-wider">
                      Raccourcis rapides :
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {quickDurationPresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => {
                            setDirectHoursInput(preset.val);
                            directInputRef.current?.focus();
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold font-mono border transition-all ${
                            directHoursInput.trim() === preset.val
                              ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                              : 'bg-slate-900 text-slate-300 border-slate-700/80 hover:bg-slate-800 hover:text-white'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* OPTION B: SAISIE DIRECTE DE PLAGE HORAIRE DÉBUT & FIN (SANS LISTES DÉROULANTES !) */}
            {entryMode === 'interval' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Heure de début tapée directement */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
                    <label 
                      htmlFor="start-time-input"
                      className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider"
                    >
                      Heure de Début
                    </label>
                    <input
                      id="start-time-input"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-purple-500 font-mono text-center cursor-text"
                    />
                  </div>

                  {/* Heure de fin tapée directement */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1.5">
                    <label 
                      htmlFor="end-time-input"
                      className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider"
                    >
                      Heure de Fin
                    </label>
                    <input
                      id="end-time-input"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-purple-500 font-mono text-center cursor-text"
                    />
                  </div>

                </div>

                {/* Calculated Duration Preview */}
                <div className="bg-purple-950/40 border border-purple-600/40 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-medium text-slate-300">Durée totale calculée :</span>
                  </div>
                  <div className="text-sm font-extrabold text-purple-300 font-mono bg-purple-900/60 px-3 py-1 rounded-lg border border-purple-500/30">
                    {intervalDurationLabel} ({intervalMinutes} min)
                  </div>
                </div>

              </div>
            )}

            {/* Note / Description */}
            <div>
              <input
                type="text"
                placeholder="Description optionnelle (ex: Montage V01, corrections son)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            {/* Facturable Checkbox */}
            <div className="flex items-center space-x-2 px-1">
              <input
                id="billable-checkbox"
                type="checkbox"
                checked={isBillable}
                onChange={(e) => setIsBillable(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 text-purple-600 focus:ring-purple-500 bg-slate-900"
              />
              <label htmlFor="billable-checkbox" className="text-xs text-slate-300 font-medium cursor-pointer">
                Temps facturable (Billable)
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || (entryMode === 'direct' ? parsedDirectMinutes <= 0 : intervalMinutes <= 0)}
              className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-purple-600/30 transition-all active:scale-[0.98]"
            >
              <span>
                Enregistrer {entryMode === 'direct' ? directDurationLabel : intervalDurationLabel} dans ClickUp
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

          </form>

        </div>
      </div>
    </div>
  );
};
