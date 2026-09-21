import { Transaction } from '../core/models';

export interface DashboardMetrics {
  totalCount: number;
  completedCount: number;
  inProgressCount: number;
  newCount: number;
  unreadCount: number;
  incomingCount: number;
  outgoingCount: number;
  internalCount: number;
  completionPercentage: number;
}

export class StatisticsService {
  static computeMetrics(transactions: Transaction[]): DashboardMetrics {
    const totalCount = transactions.length;
    let completedCount = 0;
    let inProgressCount = 0;
    let newCount = 0;
    let unreadCount = 0;
    let incomingCount = 0;
    let outgoingCount = 0;
    let internalCount = 0;

    for (const tr of transactions) {
      if (tr.status === 'مكتمل') completedCount++;
      else if (tr.status === 'قيد الإنجاز') inProgressCount++;
      else if (tr.status === 'جديد') newCount++;

      if (!tr.isRead) unreadCount++;

      if (tr.direction === 'وارد') incomingCount++;
      else if (tr.direction === 'صادر') outgoingCount++;
      else if (tr.direction === 'داخلي') internalCount++;
    }

    const completionPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return {
      totalCount,
      completedCount,
      inProgressCount,
      newCount,
      unreadCount,
      incomingCount,
      outgoingCount,
      internalCount,
      completionPercentage,
    };
  }
}
