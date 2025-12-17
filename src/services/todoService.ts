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
