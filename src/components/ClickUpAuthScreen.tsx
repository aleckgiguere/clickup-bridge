import React, { useState } from 'react';
import { Key, ShieldCheck, ArrowRight, Sparkles, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { ClickUpService } from '../services/clickupApi';
import { ClickUpUser, ClickUpWorkspace } from '../types';

interface ClickUpAuthScreenProps {
  onConnected: (apiKey: string, user: ClickUpUser, selectedTeam: ClickUpWorkspace) => void;
}

export const ClickUpAuthScreen: React.FC<ClickUpAuthScreenProps> = ({ onConnected }) => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [step, setStep] = useState<'token' | 'select_team'>('token');
  const [connectedUser, setConnectedUser] = useState<ClickUpUser | null>(null);
  const [teams, setTeams] = useState<ClickUpWorkspace[]>([]);

  const handleVerifyToken = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiKey.trim()) {
      setErrorMessage('Veuillez coller votre clé API personnelle ClickUp.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Récupérer l'utilisateur
      const user = await ClickUpService.getConnectedUser(apiKey);
      // 2. Récupérer les espaces de travail / équipes
      const workspaces = await ClickUpService.getWorkspaces(apiKey);

      if (!workspaces || workspaces.length === 0) {
        throw new Error('Aucun espace de travail (Workspace) trouvé pour ce compte ClickUp.');
      }

      setConnectedUser(user);
      setTeams(workspaces);

      if (workspaces.length === 1) {
        // Un seul workspace, on connecte directement
        onConnected(apiKey, user, workspaces[0]);
      } else {
        // Choix du workspace
        setStep('select_team');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(
        err.message || 'Impossible de se connecter à ClickUp avec cette clé. Vérifiez qu\'elle commence par "pk_..."'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTeam = (team: ClickUpWorkspace) => {
    if (connectedUser) {
      onConnected(apiKey, connectedUser, team);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-white/10 p-6 md:p-8 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-400 mb-1">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
            Connexion directe à votre ClickUp
          </h1>
          <p className="text-xs md:text-sm text-slate-400 max-w-sm mx-auto">
            Accédez à vos vraies tâches assignées, vos projets réels et punchez votre temps en 1 clic.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 bg-red-950/70 border border-red-500/50 rounded-2xl text-red-300 text-xs flex items-start space-x-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {step === 'token' ? (
          <form onSubmit={handleVerifyToken} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Votre Clé API Personnelle ClickUp (API Token) :</span>
                <a
                  href="https://app.clickup.com/settings/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center space-x-1"
                >
                  <span>Trouver ma clé</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </label>

              <div className="relative">
                <input
                  type="password"
                  placeholder="pk_12345678_ABCDEF..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
                  autoFocus
                />
              </div>
            </div>

            {/* Guide étapes simples */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-3.5 space-y-2 text-xs text-slate-400">
              <div className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider flex items-center space-x-1.5">
                <Key className="w-3.5 h-3.5 text-purple-400" />
                <span>Où trouver cette clé en 10 secondes ?</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-400">
                <li>Dans ClickUp, cliquez sur votre photo de profil en bas ou en haut.</li>
                <li>Allez dans <strong>Paramètres (Settings)</strong> → <strong>Applications (Apps)</strong>.</li>
                <li>Sous <strong>API Token</strong>, cliquez sur <strong>Generate</strong> (ou copiez votre clé <code className="text-purple-300 font-mono">pk_...</code>).</li>
              </ol>
            </div>

            <button
              type="submit"
              disabled={isLoading || !apiKey.trim()}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-purple-600/30 flex items-center justify-center space-x-2 transition-all"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Connexion en cours...</span>
                </>
              ) : (
                <>
                  <span>Connecter mon ClickUp</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center space-x-3">
              <div className="w-9 h-9 rounded-full bg-purple-900 text-purple-200 font-bold flex items-center justify-center">
                {connectedUser?.username?.slice(0, 2).toUpperCase() || 'U'}
              </div>
              <div>
                <div className="font-bold text-xs text-slate-100">{connectedUser?.username}</div>
                <div className="text-[11px] text-slate-400">{connectedUser?.email}</div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Sélectionnez votre Espace de Travail (Workspace) :
              </label>
              <div className="space-y-2">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => handleSelectTeam(team)}
                    className="w-full p-3 bg-slate-950 hover:bg-purple-950/40 border border-slate-800 hover:border-purple-600 rounded-2xl flex items-center justify-between text-left transition-all group"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-200 group-hover:text-purple-300">
                        {team.name}
                      </div>
                      <div className="text-[10px] text-slate-500">ID: {team.id}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
