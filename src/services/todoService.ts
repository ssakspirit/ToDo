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
  body?: string;
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

// @odata.nextLink를 따라가며 모든 페이지를 수집
const fetchAllPages = async (
  client: Client,
  path: string,
  query: Record<string, string | number>
): Promise<any[]> => {
  const items: any[] = [];
  let res = await client.api(path).query(query).get();
  items.push(...(res.value as any[]));
  while (res['@odata.nextLink']) {
    res = await client.api(res['@odata.nextLink']).get();
    items.push(...(res.value as any[]));
  }
  return items;
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

  // 2. 일정 목록 + 할 일 목록 전체 병렬 조회 (페이지네이션 포함)
  const [scheduleItems, todoResults] = await Promise.all([
    scheduleList
      ? fetchAllPages(client, `/me/todo/lists/${scheduleList.id}/tasks`, { $top: 200 })
      : Promise.resolve([] as any[]),
    Promise.all(
      filteredLists.map((list) =>
        fetchAllPages(client, `/me/todo/lists/${list.id}/tasks`, {
          $filter: "status ne 'completed'",
          $top: 200,
        })
          .then((items) => ({ list, items }))
          .catch(() => ({ list, items: [] as any[] }))
      )
    ),
  ]);

  const scheduleTasks: ScheduleTask[] = scheduleItems.map((t) => ({
    id: t.id, title: t.title, body: t.body?.content,
    dueDateTime: t.dueDateTime?.dateTime, status: t.status,
    importance: t.importance, createdDateTime: t.createdDateTime,
  }));

  const todoTasks: TodoTask[] = todoResults.flatMap(({ list, items }) =>
    items.map((t) => ({
      id: t.id, title: t.title,
      body: t.body?.content || undefined,
      dueDate: t.dueDateTime?.dateTime ? parseDueDateUtc(t.dueDateTime.dateTime) : null,
      listId: list.id, listName: list.displayName,
    }))
  );

  return { scheduleTasks, todoTasks };
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
