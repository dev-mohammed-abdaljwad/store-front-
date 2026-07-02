export const removeDeletedInvoiceFromQueryData = (currentData, deletedId) => {
  if (!currentData) return currentData;

  const targetId = String(deletedId);

  if (Array.isArray(currentData)) {
    return currentData.filter((item) => String(item?.id) !== targetId);
  }

  if (Array.isArray(currentData?.items)) {
    const updatedItems = currentData.items.filter((item) => String(item?.id) !== targetId);
    const total = Number(currentData?.meta?.total ?? currentData?.total ?? updatedItems.length);

    return {
      ...currentData,
      items: updatedItems,
      meta: {
        ...(currentData?.meta || {}),
        total: Math.max(0, total - (updatedItems.length < currentData.items.length ? 1 : 0)),
      },
    };
  }

  if (currentData?.data && Array.isArray(currentData.data?.items)) {
    const updatedItems = currentData.data.items.filter((item) => String(item?.id) !== targetId);
    const total = Number(currentData?.data?.meta?.total ?? currentData?.data?.total ?? updatedItems.length);

    return {
      ...currentData,
      data: {
        ...currentData.data,
        items: updatedItems,
        meta: {
          ...(currentData.data?.meta || {}),
          total: Math.max(0, total - (updatedItems.length < currentData.data.items.length ? 1 : 0)),
        },
      },
    };
  }

  return currentData;
};
