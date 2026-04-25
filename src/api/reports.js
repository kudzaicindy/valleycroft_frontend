import { axiosInstance } from './axiosInstance';

export function getWeeklyReport() {
  return axiosInstance.get('/api/reports/weekly');
}

export function getMonthlyReport() {
  return axiosInstance.get('/api/reports/monthly');
}

export function getQuarterlyReport() {
  return axiosInstance.get('/api/reports/quarterly');
}

export function getAnnualReport() {
  return axiosInstance.get('/api/reports/annual');
}

export function exportReport(type) {
  return axiosInstance.get(`/api/reports/export/${type}`);
}

export function getAiSummary(period) {
  return axiosInstance.post('/api/reports/ai-summary', { period });
}

export function downloadAiSummaryPdf(period) {
  return axiosInstance.get('/api/reports/ai-summary/pdf', {
    params: { period },
    responseType: 'blob',
  });
}
