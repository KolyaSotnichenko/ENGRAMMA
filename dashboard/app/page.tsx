'use client';
import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Brain,
  Cpu,
  Database,
  Clock,
  Server,
  Zap,
  AlertCircle,
} from 'lucide-react';
import { API_BASE_URL, getHeaders } from '@/lib/api';
import { HealthMetric } from '@/components/dashboard/HealthMetric';
import { sectorColors } from '@/lib/colors';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
);

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [qpsData, setQpsData] = useState<any[]>([]);
  const [healthMetrics, setHealthMetrics] = useState<any>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [embedLogs, setEmbedLogs] = useState<any[]>([]);
  const [timePeriod, setTimePeriod] = useState('today');
  const [qpsStats, setQpsStats] = useState<any>({});
  const [maintenanceData, setMaintenanceData] = useState<any[]>([]);
  const [maintenanceStats, setMaintenanceStats] = useState<any>({});
  const [systemHealth, setSystemHealth] = useState<any>({});
  const [backendHealth, setBackendHealth] = useState<any>({});
  const [tierStats, setTierStats] = useState<any>({ hot: 0, warm: 0, cold: 0 });

  useEffect(() => {
    fetchDashboardData();
    fetchBackendHealth();
    const dataInterval = setInterval(fetchDashboardData, 30000);
    const healthInterval = setInterval(fetchBackendHealth, 60000); // 1 minute
    return () => {
      clearInterval(dataInterval);
      clearInterval(healthInterval);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch dashboard stats
      const statsRes = await fetch(`${API_BASE_URL}/dashboard/stats`, {
        headers: getHeaders(),
      });
      if (statsRes.ok) {
        const stats = await statsRes.json();

        // Update health metrics with comprehensive data
        setHealthMetrics({
          totalMemories: stats.totalMemories || 0,
          avgSalience: parseFloat(stats.avgSalience || 0),
          recentMemories: stats.recentMemories || 0,
          totalRequests: stats.requests?.total || 0,
          errors: stats.requests?.errors || 0,
          errorRate: stats.requests?.errorRate || '0.0',
          compressionRatio: stats.memory?.compressionRatio || 0,
          avgVecDim: stats.memory?.avgVectorDim || 0,
          baseVecDim: stats.memory?.baseVectorDim || 0,
          compressionCoverage: stats.memory?.compressionCoverage || 0,
          compressedCount: stats.memory?.compressedCount || 0,
        });

        // Set QPS stats from backend data
        setQpsStats({
          peakQps: stats.qps?.peak || 0,
          avgQps: stats.qps?.average || 0,
          total: stats.totalMemories || 0,
          errors: stats.requests?.errors || 0,
          cacheHit: stats.qps?.cacheHitRate || 0,
          p50Latency: stats.qps?.latency?.p50 || 0,
          p95Latency: stats.qps?.latency?.p95 || 0,
          p99Latency: stats.qps?.latency?.p99 || 0,
        });

        // Tiered decay distribution
        setTierStats(stats.memory?.tiers || { hot: 0, warm: 0, cold: 0 });

        // Update only config-related system health (preserve health endpoint data)
        const vc = stats.cache?.vecCache || {};
        const vcTotal = (vc.hits || 0) + (vc.misses || 0);
        const vcHitRate =
          vcTotal > 0 ? Math.round(((vc.hits || 0) / vcTotal) * 100) : 0;
        setSystemHealth((prev: any) => ({
          ...prev,
          activeSegments: stats.config?.cacheSegments || 0,
          maxActive: stats.config?.maxActive || 0,
          vecHits: vc.hits || 0,
          vecMisses: vc.misses || 0,
          vecHitRate: vcHitRate || 0,
          vecSize: vc.size || 0,
          vecEvictions: vc.evictions || 0,
          vecTTL: vc.ttl_ms || 0,
          vecMax: vc.max_entries || 0,
        }));
      }

      // Fetch activity logs
      const activityRes = await fetch(
        `${API_BASE_URL}/dashboard/activity?limit=20`,
        {
          headers: getHeaders(),
        },
      );
      if (activityRes.ok) {
        const activity = await activityRes.json();
        setLogs(
          activity.activities?.map((a: any) => ({
            time: new Date(a.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }),
            event: a.type.replace('_', ' '),
            sector: a.sector,
            salience: a.salience?.toFixed(2),
            level:
              a.salience > 0.8
                ? 'Critical'
                : a.salience > 0.5
                ? 'Warning'
                : 'Info',
          })) || [],
        );
      }

      // Fetch embedding logs
      const embedRes = await fetch(
        `${API_BASE_URL}/dashboard/embed-logs?limit=50`,
        { headers: getHeaders() },
      );
      if (embedRes.ok) {
        const data = await embedRes.json();
        setEmbedLogs(
          (data.logs || []).map((e: any) => ({
            time: new Date(e.ts).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }),
            model: e.model,
            status: e.status,
            err: e.err || '',
          })),
        );
      }

      // Fetch sector timeline
      const timelineRes = await fetch(
        `${API_BASE_URL}/dashboard/sectors/timeline?hours=24`,
        {
          headers: getHeaders(),
        },
      );
      if (timelineRes.ok) {
        const timeline = await timelineRes.json();
        const grouped: Record<string, any> = {};

        timeline.timeline?.forEach((item: any) => {
          if (!grouped[item.hour]) {
            grouped[item.hour] = { hour: item.hour };
          }
          grouped[item.hour][item.primary_sector] = item.count;
        });

        const chartData = Object.values(grouped).map((item: any) => ({
          hour: item.hour,
          semantic: item.semantic || 0,
          episodic: item.episodic || 0,
          procedural: item.procedural || 0,
          emotional: item.emotional || 0,
          reflective: item.reflective || 0,
        }));

        setQpsData(chartData);
      }

      // fetch neural maintenance data
      const maintRes = await fetch(
        `${API_BASE_URL}/dashboard/maintenance?hours=24`,
        {
          headers: getHeaders(),
        },
      );
      if (maintRes.ok) {
        const maint = await maintRes.json();
        setMaintenanceData(maint.operations || []);
        setMaintenanceStats(
          maint.totals || {
            cycles: 0,
            reflections: 0,
            consolidations: 0,
            efficiency: 0,
          },
        );
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const fetchBackendHealth = async () => {
    try {
      const healthRes = await fetch(`${API_BASE_URL}/dashboard/health`);
      if (healthRes.ok) {
        const health = await healthRes.json();
        setBackendHealth(health);

        // Update system health with real backend data (merge with existing)
        setSystemHealth((prev: any) => ({
          ...prev,
          memoryUsage:
            health.memory?.heapUsed && health.memory?.heapTotal
              ? Math.round(
                  (health.memory.heapUsed / health.memory.heapTotal) * 100,
                )
              : 0,
          heapUsed: health.memory?.heapUsed || 0,
          heapTotal: health.memory?.heapTotal || 0,
          rss: health.memory?.rss || 0,
          external: health.memory?.external || 0,
          uptimeDays: health.uptime?.days || 0,
          uptimeHours: health.uptime?.hours || 0,
          uptimeSeconds: health.uptime?.seconds || 0,
        }));
      }
    } catch (error) {
      console.error('Error fetching backend health:', error);
    }
  };

  const timePeriods = [
    { value: 'today', label: 'Today' },
    { value: '1d', label: '1D' },
    { value: '1w', label: '1W' },
    { value: '1m', label: '1M' },
    { value: '1y', label: '1Y' },
    { value: '5y', label: '5Y' },
    { value: 'max', label: 'All' },
  ];

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <Brain className="w-10 h-10 text-stone-600 mx-auto" />
          </motion.div>
          <div className="text-stone-600 text-sm font-medium tracking-widest uppercase">
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-stone-200">Overview</h2>
        </div>
        <div className="flex bg-stone-900/50 p-1 rounded-lg border border-stone-800/50">
          {timePeriods.map((period) => (
            <button
              key={period.value}
              onClick={() => setTimePeriod(period.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                timePeriod === period.value
                  ? 'bg-stone-800 text-stone-200 shadow-sm'
                  : 'text-stone-500 hover:text-stone-300 hover:bg-stone-800/30'
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-4">
        {[
          {
            label: 'Total Memories',
            value: healthMetrics.totalMemories?.toLocaleString() || '0',
            icon: Database,
            color: 'text-blue-400',
            bg: 'bg-blue-500/5',
            border: 'border-blue-500/10',
          },
          {
            label: 'Recent (24h)',
            value: healthMetrics.recentMemories || '0',
            icon: Clock,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/5',
            border: 'border-emerald-500/10',
          },
          {
            label: 'Avg Salience',
            value: (healthMetrics.avgSalience || 0).toFixed(2),
            icon: Brain,
            color: 'text-purple-400',
            bg: 'bg-purple-500/5',
            border: 'border-purple-500/10',
          },
          {
            label: 'API Requests',
            value: (healthMetrics.totalRequests || 0).toLocaleString(),
            icon: Zap,
            color: 'text-amber-400',
            bg: 'bg-amber-500/5',
            border: 'border-amber-500/10',
          },
          {
            label: 'Errors',
            value: healthMetrics.errors || '0',
            icon: AlertCircle,
            color:
              healthMetrics.errors > 10 ? 'text-red-400' : 'text-stone-400',
            bg: healthMetrics.errors > 10 ? 'bg-red-500/5' : 'bg-stone-500/5',
            border:
              healthMetrics.errors > 10
                ? 'border-red-500/10'
                : 'border-stone-500/10',
          },
          {
            label: 'Memory Usage',
            value: `${systemHealth.heapUsed || 0}MB`,
            icon: Cpu,
            color: 'text-cyan-400',
            bg: 'bg-cyan-500/5',
            border: 'border-cyan-500/10',
          },
          {
            label: 'Uptime',
            value: `${systemHealth.uptimeDays || 0}d`,
            icon: Server,
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/5',
            border: 'border-indigo-500/10',
          },
          {
            label: 'Compression Ratio',
            value: `${healthMetrics.compressionRatio || 0}% (${
              healthMetrics.avgVecDim || 0
            }/${healthMetrics.baseVecDim || 0})`,
            icon: Cpu,
            color: 'text-amber-400',
            bg: 'bg-amber-500/5',
            border: 'border-amber-500/10',
          },
          {
            label: 'Compression Coverage',
            value: `${healthMetrics.compressionCoverage || 0}% (${(
              healthMetrics.compressedCount || 0
            ).toLocaleString()})`,
            icon: Database,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/5',
            border: 'border-emerald-500/10',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`p-4 rounded-xl border ${stat.border} ${stat.bg} hover:bg-opacity-10 transition-colors bg-opacity-20`}
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                {stat.label}
              </span>
            </div>
            <div className="text-xl font-bold text-stone-200 font-mono">
              {stat.value}
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {[
          {
            label: 'Hot',
            value: tierStats.hot || 0,
            color: 'text-red-400',
            bg: 'bg-red-500/5',
            border: 'border-red-500/10',
          },
          {
            label: 'Warm',
            value: tierStats.warm || 0,
            color: 'text-amber-400',
            bg: 'bg-amber-500/5',
            border: 'border-amber-500/10',
          },
          {
            label: 'Cold',
            value: tierStats.cold || 0,
            color: 'text-blue-400',
            bg: 'bg-blue-500/5',
            border: 'border-blue-500/10',
          },
        ].map((t) => (
          <div
            key={t.label}
            className={`p-3 rounded-xl border ${t.border} ${t.bg} bg-opacity-20`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`w-2 h-2 rounded-full ${t.bg.replace('/5', '')}`}
              />
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                {t.label} Tier
              </span>
            </div>
            <div className="text-lg font-bold text-stone-200 font-mono">
              {t.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6 mb-6">
        {}
        <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#f4f4f5]">
              Memory Query Load
            </h2>
            <div className="flex gap-2">
              <select className="rounded-xl p-2 pl-4 border border-stone-800 bg-stone-950 hover:bg-stone-900/50 hover:text-stone-300 text-sm font-medium text-stone-400 outline-none cursor-pointer transition-colors">
                <option className="bg-stone-950">24 hours</option>
                <option className="bg-stone-950">7 days</option>
                <option className="bg-stone-950">30 days</option>
              </select>
            </div>
          </div>
          <div style={{ height: '280px' }}>
            <Bar
              data={{
                labels: qpsData.map((d) => d.hour),
                datasets: [
                  {
                    label: 'Semantic',
                    data: qpsData.map((d) => d.semantic),
                    backgroundColor: 'rgba(248, 113, 113, 0.7)',
                    borderColor: 'rgba(248, 113, 113, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Episodic',
                    data: qpsData.map((d) => d.episodic),
                    backgroundColor: 'rgba(251, 191, 36, 0.7)',
                    borderColor: 'rgba(251, 191, 36, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Procedural',
                    data: qpsData.map((d) => d.procedural),
                    backgroundColor: 'rgba(52, 211, 153, 0.7)',
                    borderColor: 'rgba(52, 211, 153, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Emotional',
                    data: qpsData.map((d) => d.emotional),
                    backgroundColor: 'rgba(96, 165, 250, 0.7)',
                    borderColor: 'rgba(96, 165, 250, 1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Reflective',
                    data: qpsData.map((d) => d.reflective),
                    backgroundColor: 'rgba(192, 132, 252, 0.7)',
                    borderColor: 'rgba(192, 132, 252, 1)',
                    borderWidth: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: 'index',
                  intersect: false,
                },
                scales: {
                  x: {
                    stacked: true,
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                  y: {
                    stacked: true,
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                  tooltip: {
                    backgroundColor: '#111111',
                    borderColor: '#52525b',
                    borderWidth: 1,
                    titleColor: '#e6e6e6',
                    bodyColor: '#e6e6e6',
                    padding: 12,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    boxPadding: 4,
                  },
                },
              }}
            />
          </div>
          <div className="flex gap-3 text-xs text-[#8a8a8a] mt-4 pt-4 border-t border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.semantic }}
              />
              semantic
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.episodic }}
              />
              episodic
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.procedural }}
              />
              procedural
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.emotional }}
              />
              emotional
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: sectorColors.reflective }}
              />
              reflective
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2 mt-4">
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Peak QPS</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {qpsStats.peakQps || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Avg QPS</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {qpsStats.avgQps || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Total</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {(qpsStats.total || 0).toLocaleString()}k
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Errors</p>
              <p className="text-lg font-bold text-[#f87171]">
                {qpsStats.errors || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Cache Hit</p>
              <p className="text-lg font-bold text-[#22c55e]">
                {qpsStats.cacheHit || 0}%
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">p50 Latency</p>
              <p className="text-lg font-bold text-[#22d3ee]">
                {qpsStats.p50Latency || 0} ms
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">p95 Latency</p>
              <p className="text-lg font-bold text-[#fbbf24]">
                {qpsStats.p95Latency || 0} ms
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">p99 Latency</p>
              <p className="text-lg font-bold text-[#f43f5e]">
                {qpsStats.p99Latency || 0} ms
              </p>
            </div>
          </div>
        </div>

        {}
        <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-[#f4f4f5]">
              Neural Maintenance
            </h2>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse" />
              <span className="text-xs text-[#8a8a8a]">Active</span>
            </div>
          </div>
          <div style={{ height: '280px' }}>
            <Bar
              data={{
                labels: maintenanceData.map((d) => d.hour),
                datasets: [
                  {
                    label: 'Decay Cycles',
                    data: maintenanceData.map((d) => d.decay),
                    backgroundColor: 'rgba(34,197,94,0.5)',
                    borderColor: 'rgba(34,197,94,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Decay Hot',
                    data: maintenanceData.map((d) => d.decay_hot || 0),
                    backgroundColor: 'rgba(248,113,113,0.5)',
                    borderColor: 'rgba(248,113,113,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Decay Warm',
                    data: maintenanceData.map((d) => d.decay_warm || 0),
                    backgroundColor: 'rgba(251,191,36,0.5)',
                    borderColor: 'rgba(251,191,36,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Decay Cold',
                    data: maintenanceData.map((d) => d.decay_cold || 0),
                    backgroundColor: 'rgba(96,165,250,0.5)',
                    borderColor: 'rgba(96,165,250,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Prune Weak',
                    data: maintenanceData.map((d) => d.prune_weak || 0),
                    backgroundColor: 'rgba(244,63,94,0.5)',
                    borderColor: 'rgba(244,63,94,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Prune Old',
                    data: maintenanceData.map((d) => d.prune_old || 0),
                    backgroundColor: 'rgba(234,88,12,0.5)',
                    borderColor: 'rgba(234,88,12,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Prune Dense',
                    data: maintenanceData.map((d) => d.prune_dense || 0),
                    backgroundColor: 'rgba(59,130,246,0.5)',
                    borderColor: 'rgba(59,130,246,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Compression',
                    data: maintenanceData.map((d) => d.compression || 0),
                    backgroundColor: 'rgba(234,179,8,0.5)',
                    borderColor: 'rgba(234,179,8,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Fingerprint',
                    data: maintenanceData.map((d) => d.fingerprint || 0),
                    backgroundColor: 'rgba(99,102,241,0.5)',
                    borderColor: 'rgba(99,102,241,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Regeneration',
                    data: maintenanceData.map((d) => d.regenerate || 0),
                    backgroundColor: 'rgba(45,212,191,0.5)',
                    borderColor: 'rgba(45,212,191,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Reinforce',
                    data: maintenanceData.map((d) => d.reinforce || 0),
                    backgroundColor: 'rgba(168,85,247,0.5)',
                    borderColor: 'rgba(168,85,247,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Reflections',
                    data: maintenanceData.map((d) => d.reflection),
                    backgroundColor: 'rgba(96,165,250,0.7)',
                    borderColor: 'rgba(96,165,250,1)',
                    borderWidth: 0,
                  },
                  {
                    label: 'Consolidations',
                    data: maintenanceData.map((d) => d.consolidation),
                    backgroundColor: 'rgba(192,132,252,0.7)',
                    borderColor: 'rgba(192,132,252,1)',
                    borderWidth: 0,
                  },
                ],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                  mode: 'index',
                  intersect: false,
                },
                scales: {
                  x: {
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                  y: {
                    grid: {
                      color: '#2a2a2a',
                    },
                    ticks: {
                      color: '#9ca3af',
                      font: { size: 11 },
                    },
                  },
                },
                plugins: {
                  legend: {
                    display: false,
                  },
                  tooltip: {
                    backgroundColor: '#111111',
                    borderColor: '#52525b',
                    borderWidth: 1,
                    titleColor: '#e6e6e6',
                    bodyColor: '#e6e6e6',
                    padding: 12,
                    displayColors: true,
                    boxWidth: 12,
                    boxHeight: 12,
                    boxPadding: 4,
                  },
                },
              }}
            />
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-[#8a8a8a] mt-4 pt-4 border-t border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
            {[
              { label: 'decay', color: '#22c55e' },
              { label: 'hot', color: '#f87171' },
              { label: 'warm', color: '#fbbf24' },
              { label: 'cold', color: '#60a5fa' },
              { label: 'prune_weak', color: '#f43f5e' },
              { label: 'prune_old', color: '#ea580c' },
              { label: 'prune_dense', color: '#3b82f6' },
              { label: 'compression', color: '#eab308' },
              { label: 'fingerprint', color: '#6366f1' },
              { label: 'regeneration', color: '#2dd4bf' },
              { label: 'reinforce', color: '#a855f7' },
              { label: 'reflections', color: '#60a5fa' },
              { label: 'consolidations', color: '#c084fc' },
            ].map((i) => (
              <div key={i.label} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: i.color }}
                />
                {i.label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-12 gap-2 mt-4">
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Cycles</p>
              <p className="text-lg font-bold text-[#f4f4f5]">
                {maintenanceStats.cycles || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Hot</p>
              <p className="text-lg font-bold text-[#f87171]">
                {maintenanceStats.cycles_by_tier?.hot || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Warm</p>
              <p className="text-lg font-bold text-[#fbbf24]">
                {maintenanceStats.cycles_by_tier?.warm || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Cold</p>
              <p className="text-lg font-bold text-[#60a5fa]">
                {maintenanceStats.cycles_by_tier?.cold || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Prune Weak</p>
              <p className="text-lg font-bold text-[#f43f5e]">
                {maintenanceStats.prunes?.weak || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Prune Old</p>
              <p className="text-lg font-bold text-[#ea580c]">
                {maintenanceStats.prunes?.old || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Prune Dense</p>
              <p className="text-lg font-bold text-[#3b82f6]">
                {maintenanceStats.prunes?.dense || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Compression</p>
              <p className="text-lg font-bold text-[#eab308]">
                {maintenanceStats.compression || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Fingerprint</p>
              <p className="text-lg font-bold text-[#6366f1]">
                {maintenanceStats.fingerprints || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Regeneration</p>
              <p className="text-lg font-bold text-[#2dd4bf]">
                {maintenanceStats.regenerations || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center">
              <p className="text-xs text-[#8a8a8a] mb-1">Reinforce</p>
              <p className="text-lg font-bold text-[#a855f7]">
                {maintenanceStats.reinforcements || 0}
              </p>
            </div>
            <div className="bg-transparent rounded p-2 border border-[#27272a] text-center col-span-12 lg:col-span-3">
              <p className="text-xs text-[#8a8a8a] mb-1">Efficiency</p>
              <p className="text-lg font-bold text-[#22c55e]">
                {maintenanceStats.efficiency || 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="mb-6 bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200  transition-all duration-300">
        <h2 className="text-lg font-semibold text-[#f4f4f5] mb-4">
          System Health
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-4">
            <HealthMetric
              label="Memory Usage"
              value={systemHealth.memoryUsage || 0}
            />
          </div>
          <div className="space-y-2 text-sm text-[#8a8a8a]">
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Heap Used</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.heapUsed || 0} MB
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Heap Total</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.heapTotal || 0} MB
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>RSS Memory</span>
              <span className="text-[#e6e6e6]">{systemHealth.rss || 0} MB</span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>External Memory</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.external || 0} MB
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Uptime</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.uptimeDays || 0}d {systemHealth.uptimeHours || 0}h
              </span>
            </div>
          </div>
          <div className="space-y-2 text-sm text-[#8a8a8a]">
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Active Segments</span>
              <span className="text-[#e6e6e6]">
                ✓ {systemHealth.activeSegments || 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Max Active</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.maxActive || 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache Hit Rate</span>
              <span className="text-[#22c55e]">
                {systemHealth.vecHitRate || 0}%
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache Hits</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.vecHits || 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache Misses</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.vecMisses || 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache Entries</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.vecSize || 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache Evictions</span>
              <span className="text-[#e6e6e6]">
                {systemHealth.vecEvictions || 0}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache TTL</span>
              <span className="text-[#e6e6e6]">
                {Math.round((systemHealth.vecTTL || 0) / 1000)}s
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Vec Cache Max</span>
              <span className="text-[#e6e6e6]">{systemHealth.vecMax || 0}</span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Node Version</span>
              <span className="text-[#22c55e]">
                ✓ {backendHealth.process?.version || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Platform</span>
              <span className="text-[#e6e6e6]">
                {backendHealth.process?.platform || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between border-b border-[#27272a] pb-2">
              <span>Process ID</span>
              <span className="text-[#e6e6e6]">
                {backendHealth.process?.pid || 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {}
        <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200  transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[#f4f4f5]">
              Memory & System Logs
            </h2>
            <div className="flex gap-2">
              <select className="rounded-xl p-2 pl-4 border border-stone-800 bg-stone-950 hover:bg-stone-900/50 hover:text-stone-300 text-sm font-medium text-stone-400 outline-none cursor-pointer transition-colors">
                <option className="bg-stone-950">All Levels</option>
                <option className="bg-stone-950">Info</option>
                <option className="bg-stone-950">Warning</option>
                <option className="bg-stone-950">Critical</option>
              </select>
            </div>
          </div>
          <div className="bg-transparent rounded-lg p-2 mb-2 grid grid-cols-5 gap-2 text-xs font-semibold text-[#8a8a8a] border border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
            <span>Time</span>
            <span className="col-span-2">Event</span>
            <span>Sector</span>
            <span>Salience</span>
          </div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {logs.length > 0 ? (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className="bg-transparent rounded px-2 py-2 grid grid-cols-5 gap-2 text-xs text-[#9ca3af] hover:bg-transparent border border-transparent transition-colors"
                >
                  <span className="text-[#6b7280]">{log.time}</span>
                  <span className="col-span-2">{log.event}</span>
                  <span className="text-[#6b7280]">{log.sector}</span>
                  <span
                    className={
                      log.level === 'Critical'
                        ? 'text-[#f87171]'
                        : log.level === 'Warning'
                        ? 'text-[#facc15]'
                        : 'text-[#9ca3af]'
                    }
                  >
                    {log.salience}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-center text-stone-500 py-8">
                No activity logs yet. Start adding memories!
              </div>
            )}
          </div>
        </div>

        {}
        <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 transition-all duration-300">
          <h2 className="text-lg font-semibold text-[#f4f4f5] mb-4">
            Recent Memory Activity
          </h2>
          <div className="space-y-2">
            {logs.length > 0 ? (
              logs.slice(0, 10).map((log, idx) => (
                <div
                  key={idx}
                  className="bg-transparent rounded p-3 text-sm border border-[#27272a] hover:border-zinc-600 transition-colors duration-200"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[#e6e6e6] font-medium">
                      {log.event}
                    </span>
                    <span className="text-xs text-[#6b7280]">{log.time}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-[#8a8a8a]">
                    <span>
                      Sector:{' '}
                      <span className="text-[#9ca3af]">{log.sector}</span>
                    </span>
                    <span>
                      Salience:{' '}
                      <span
                        className={
                          log.level === 'Critical'
                            ? 'text-[#f87171]'
                            : log.level === 'Warning'
                            ? 'text-[#facc15]'
                            : 'text-[#9ca3af]'
                        }
                      >
                        {log.salience}
                      </span>
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-stone-500 py-8">
                No recent activity
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-transparent rounded-xl p-6 border border-[#27272a] hover:border-zinc-600 transition-colors duration-200 transition-all duration-300">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#f4f4f5]">
            Embedding Logs
          </h2>
        </div>
        <div className="bg-transparent rounded-lg p-2 mb-2 grid grid-cols-4 gap-2 text-xs font-semibold text-[#8a8a8a] border border-[#27272a] hover:border-zinc-600 transition-colors duration-200">
          <span>Time</span>
          <span>Model</span>
          <span>Status</span>
          <span>Error</span>
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {embedLogs.length > 0 ? (
            embedLogs.map((e, idx) => (
              <div
                key={idx}
                className="bg-transparent rounded px-2 py-2 grid grid-cols-4 gap-2 text-xs text-[#9ca3af] hover:bg-transparent border border-transparent transition-colors"
              >
                <span className="text-[#6b7280]">{e.time}</span>
                <span className="text-[#e6e6e6]">{e.model}</span>
                <span className="text-[#9ca3af]">{e.status}</span>
                <span className="text-[#f87171]">{e.err}</span>
              </div>
            ))
          ) : (
            <div className="text-center text-stone-500 py-8">
              No embedding logs
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
