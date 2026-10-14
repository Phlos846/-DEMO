import { buildCompanyShell } from './companies.js?v=1.1.42';
import { materializeCompany, computeCompanyDifficulty } from './match.js?v=1.1.42';
import { scheduleInterview } from './interviews.js?v=1.1.42';
import { applyMoneyDelta } from './talentRuntime.js?v=1.1.42';

export const REFERRAL_INTERVIEW_BONUS = .15;
export const REFERRAL_DECLINE_CASH = 100;

export function grantTaskInterviews(s) {
  if (s.gameOver || s.godMode) return;
  for (const request of s.taskInterviewRequests ?? []) {
    if (request.status || request.granted) {
      if (request.status === 'pending' && s.day > request.deadline) {
        request.status = 'expired';
        s.log.unshift({ day: s.day, msg: `【岗位推荐】${request.taskName} 的确认期限已过，保留此前的能力奖励。` });
        if (s.log.length > 80) s.log.pop();
      }
      continue;
    }
    const company = buildCompanyShell(0, Math.floor(Math.random() * 1e9));
    company.id = `task_${request.taskId}_${s.careerRunId}`;
    company.isStretchRole = true;
    materializeCompany(s, company);
    // A verified school/alumni recommendation cannot be a pyramid-scheme shell.
    if (company.hiddenTag?.id === 'hid_pyramid') {
      company.hiddenTag = null; company.hasHidden = false;
      company.difficulty = computeCompanyDifficulty(company);
    }
    company.taskInterviewBonus = REFERRAL_INTERVIEW_BONUS;
    request.company = company;
    request.deadline = s.maxDays - 1;
    request.status = 'pending';
    s.log.unshift({ day: s.day, msg: `【岗位推荐】${request.taskName}：${company.name}，${company.tags.salary.label}。请在第 ${request.deadline} 天结束前选择接受或放弃。` });
    if (s.log.length > 80) s.log.pop();
  }
}

export function resolveTaskReferral(s, request, accept) {
  if (s.gameOver || s.godMode || s.applySession || !(s.taskInterviewRequests ?? []).includes(request)
      || request.status !== 'pending' || s.day > request.deadline) return false;
  request.status = accept ? 'accepted' : 'declined';
  if (accept) {
    scheduleInterview(s, request.company, { hiddenRevealed: false }, { silent: true });
    s.log.unshift({ day: s.day, msg: `【岗位推荐】已接受 ${request.company.name}，进入面试队列。该场基础成功率 +15 个百分点，仍受状态惩罚与上限限制。` });
  } else {
    const before = s.money;
    applyMoneyDelta(s, REFERRAL_DECLINE_CASH);
    request.declineCash = s.money - before;
    s.log.unshift({ day: s.day, msg: `【岗位推荐】已放弃 ${request.company.name}，资料补贴 +${request.declineCash} 元；保留任务完成时的能力奖励。` });
  }
  if (s.log.length > 80) s.log.pop();
  return true;
}
