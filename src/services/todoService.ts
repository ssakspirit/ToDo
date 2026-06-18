import { Client } from "@microsoft/microsoft-graph-client";
import { getAccessToken } from "./authService";
import { TaskDetails } from "../types";

const getGraphClient = async (): Promise<Client> => {
  const accessToken = await getAccessToken();

  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
};

export interface TodoList {
  id: string;
  displayName: string;
}

export const getTodoLists = async (): Promise<TodoList[]> => {
  try {
    const client = await getGraphClient();
    const response = await client.api("/me/todo/lists").get();
    return response.value;
  } catch (error) {
    console.error("To-Do 목록 가져오기 실패:", error);
    throw error;
  }
};

export const createTask = async (
  listId: string,
  task: TaskDetails
): Promise<any> => {
  try {
    const client = await getGraphClient();

    const taskBody: any = {
      title: task.title,
      body: {
        content: task.body,
        contentType: "text",
      },
      importance: task.importance,
    };

    if (task.dueDateTime) {
      taskBody.dueDateTime = {
        dateTime: task.dueDateTime,
        timeZone: "Asia/Seoul",
      };
    }

    if (task.reminderDateTime) {
      taskBody.isReminderOn = true;
      taskBody.reminderDateTime = {
        dateTime: task.reminderDateTime,
        timeZone: "Asia/Seoul",
      };
    }

    if (task.categories && task.categories.length > 0) {
      taskBody.categories = task.categories;
    }

    const response = await client
      .api(`/me/todo/lists/${listId}/tasks`)
      .post(taskBody);

    return response;
  } catch (error) {
    console.error("작업 생성 실패:", error);
    throw error;
  }
};

export interface ScheduleTask {
  id: string;
  title: string;
  body?: string;
  dueDateTime?: string;
  status: 'notStarted' | 'inProgress' | 'completed' | string;
  importance: string;
  createdDateTime: string;
}

export interface TodoTask {
  id: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD, or null if no due date
  listId: string;
  listName: string;
}

function parseDueDateUtc(dtString: string): string {
  const s =
    dtString.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dtString)
      ? dtString
      : dtString + 'Z';
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 모든 리스트에서 기한이 있는 미완료 작업을 가져옴
export const getAllTasksWithDueDates = async (
  excludeListNames: string[] = []
): Promise<TodoTask[]> => {
  try {
    const client = await getGraphClient();
    const listsResponse = await client.api('/me/todo/lists').get();
    const lists: TodoList[] = (listsResponse.value as TodoList[]).filter(
      (l) => !excludeListNames.includes(l.displayName)
    );

    const results = await Promise.all(
      lists.map(async (list) => {
        try {
          const res = await client
            .api(`/me/todo/lists/${list.id}/tasks`)
            .query({ $filter: "status ne 'completed'", $top: 200 })
            .get();
          return (res.value as any[])
            .map((t) => ({
              id: t.id,
              title: t.title,
              dueDate: t.dueDateTime?.dateTime
                ? parseDueDateUtc(t.dueDateTime.dateTime)
                : null,
              listId: list.id,
              listName: list.displayName,
            }));
        } catch {
          return [];
        }
      })
    );
    return results.flat();
  } catch (error) {
    console.error('전체 작업 가져오기 실패:', error);
    return [];
  }
};

// 특정 작업을 완료 처리
export const completeTask = async (listId: string, taskId: string): Promise<void> => {
  const client = await getGraphClient();
  await client
    .api(`/me/todo/lists/${listId}/tasks/${taskId}`)
    .patch({ status: 'completed' });
};

// 기한이 있는 작업 생성
export const createTaskWithDueDate = async (
  listId: string,
  title: string,
  dueDate: string // YYYY-MM-DD
): Promise<void> => {
  const client = await getGraphClient();
  await client.api(`/me/todo/lists/${listId}/tasks`).post({
    title,
    dueDateTime: {
      dateTime: `${dueDate}T23:59:00.0000000`,
      timeZone: 'Asia/Seoul',
    },
  });
};

// 목록 한 번 조회 후 작업 조회를 병렬로 처리
export const loadAllTasks = async (
  scheduleListName: string,
  excludeListNames: string[]
): Promise<{ scheduleTasks: ScheduleTask[]; todoTasks: TodoTask[] }> => {
  const client = await getGraphClient();

  // 1. 목록 한 번만 조회
  const listsResponse = await client.api('/me/todo/lists').get();
  const allLists: TodoList[] = listsResponse.value;

  const scheduleList = allLists.find((l) => l.displayName === scheduleListName) ?? null;
  const filteredLists = allLists.filter(
    (l) => l.displayName !== scheduleListName && !excludeListNames.includes(l.displayName)
  );

  // 2. 일정 목록 + 할 일 목록 전체 병렬 조회
  const [scheduleRes, todoResults] = await Promise.all([
    scheduleList
      ? client.api(`/me/todo/lists/${scheduleList.id}/tasks`).query({ $top: 200 }).get()
      : Promise.resolve({ value: [] }),
    Promise.all(
      filteredLists.map((list) =>
        client
          .api(`/me/todo/lists/${list.id}/tasks`)
          .query({ $filter: "status ne 'completed'", $top: 200 })
          .get()
          .then((res) => ({ list, items: res.value as any[] }))
          .catch(() => ({ list, items: [] as any[] }))
      )
    ),
  ]);

  const scheduleTasks: ScheduleTask[] = (scheduleRes.value as any[]).map((t) => ({
    id: t.id, title: t.title, body: t.body?.content,
    dueDateTime: t.dueDateTime?.dateTime, status: t.status,
    importance: t.importance, createdDateTime: t.createdDateTime,
  }));

  const todoTasks: TodoTask[] = todoResults.flatMap(({ list, items }) =>
    items.map((t) => ({
      id: t.id, title: t.title,
      dueDate: t.dueDateTime?.dateTime ? parseDueDateUtc(t.dueDateTime.dateTime) : null,
      listId: list.id, listName: list.displayName,
    }))
  );

  return { scheduleTasks, todoTasks };
};

// 완료 여부 무관하게 모든 할 일을 가져옴 (방학/휴업 날짜 파악용)
export const getAllScheduleTasks = async (listName: string): Promise<ScheduleTask[]> => {
  try {
    const client = await getGraphClient();
    const listsResponse = await client.api('/me/todo/lists').get();
    const lists: TodoList[] = listsResponse.value;

    const target = lists.find((l) => l.displayName === listName);
    if (!target) return [];

    const tasksResponse = await client
      .api(`/me/todo/lists/${target.id}/tasks`)
      .query({ $top: 200 })
      .get();

    return tasksResponse.value.map((t: any) => ({
      id: t.id,
      title: t.title,
      body: t.body?.content,
      dueDateTime: t.dueDateTime?.dateTime,
      status: t.status,
      importance: t.importance,
      createdDateTime: t.createdDateTime,
    }));
  } catch (error) {
    console.error('전체 일정 가져오기 실패:', error);
    throw error;
  }
};

export const getScheduleTasks = async (listName: string): Promise<ScheduleTask[]> => {
  try {
    const client = await getGraphClient();
    const listsResponse = await client.api('/me/todo/lists').get();
    const lists: TodoList[] = listsResponse.value;

    const target = lists.find((l) => l.displayName === listName);
    if (!target) return [];

    const tasksResponse = await client
      .api(`/me/todo/lists/${target.id}/tasks`)
      .query({ $filter: "status ne 'completed'", $orderby: 'createdDateTime desc', $top: 50 })
      .get();

    return tasksResponse.value.map((t: any) => ({
      id: t.id,
      title: t.title,
      body: t.body?.content,
      dueDateTime: t.dueDateTime?.dateTime,
      status: t.status,
      importance: t.importance,
      createdDateTime: t.createdDateTime,
    }));
  } catch (error) {
    console.error('일정 가져오기 실패:', error);
    throw error;
  }
};

export const createTasksInBatch = async (
  listId: string,
  tasks: TaskDetails[]
): Promise<any[]> => {
  const results = [];
  for (const task of tasks) {
    try {
      const result = await createTask(listId, task);
      results.push({ success: true, data: result });
    } catch (error) {
      results.push({ success: false, error, task });
    }
  }
  return results;
};
