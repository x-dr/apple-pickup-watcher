import { PlusOutlined } from "@ant-design/icons";
import { Button, Select, Skeleton } from "antd";
import { useEffect, useMemo, useState } from "react";

import {
  capacityOptions,
  colorOptions,
  familyOptions,
  productsInCategory,
} from "@/domain/catalog";
import {
  CATEGORY_OPTIONS,
  productUrl,
  REGIONS,
  targetKey,
  type CatalogPayload,
  type Category,
  type Product,
  type Target,
  type TargetState,
} from "@/domain/types";

interface Props {
  locale: string;
  catalog: CatalogPayload | null;
  loading: boolean;
  rows: TargetState[];
  onLocaleChange(locale: string): void;
  onAdd(target: Target): void;
}

const searchable = { optionFilterProp: "label" } as const;

export function TargetBuilder({ locale, catalog, loading, rows, onLocaleChange, onAdd }: Props) {
  const [category, setCategory] = useState<Category>("iphone");
  const [storeNumber, setStoreNumber] = useState<string>();
  const [partNumber, setPartNumber] = useState<string>();
  const [family, setFamily] = useState<string>();
  const [capacity, setCapacity] = useState<string>();
  const [color, setColor] = useState<string>();

  useEffect(() => {
    setStoreNumber(undefined);
    setPartNumber(undefined);
    setFamily(undefined);
    setCapacity(undefined);
    setColor(undefined);
  }, [locale]);

  const products = catalog?.products ?? [];
  const productOptions = useMemo(
    () => productsInCategory(products, category).map((item) => ({ value: item.partNumber, label: item.title })),
    [category, products],
  );
  const families = useMemo(() => familyOptions(products, category), [category, products]);
  const capacities = useMemo(
    () => capacityOptions(products, category, family ?? ""),
    [category, family, products],
  );
  const colors = useMemo(
    () => colorOptions(products, category, family ?? "", capacity ?? ""),
    [capacity, category, family, products],
  );
  const stores = useMemo(
    () => (catalog?.stores ?? []).map((item) => ({ value: item.number, label: item.title })),
    [catalog?.stores],
  );

  const selectedProduct: Product | undefined = products.find((item) =>
    category === "iphone"
      ? item.category === category && item.family === family && item.capacity === capacity && item.color === color
      : item.partNumber === partNumber,
  );
  const selectedStore = catalog?.stores.find((item) => item.number === storeNumber);
  const target = selectedProduct && selectedStore
    ? {
        locale,
        storeNumber: selectedStore.number,
        storeTitle: selectedStore.title,
        partNumber: selectedProduct.partNumber,
        productName: selectedProduct.title,
        productUrl: productUrl(
          locale,
          selectedProduct.partNumber,
          selectedProduct.companionPart,
        ),
        ...(selectedProduct.companionPart ? { companionPart: selectedProduct.companionPart } : {}),
      }
    : null;
  const duplicate = target ? rows.some((row) => targetKey(row.target) === targetKey(target)) : false;
  const storeGroups = new Set(rows.map((row) => `${row.target.locale}|${row.target.storeNumber}`));
  const wouldExceedStores = target
    ? !storeGroups.has(`${target.locale}|${target.storeNumber}`) && storeGroups.size >= 6
    : false;

  const resetProduct = () => {
    setPartNumber(undefined);
    setFamily(undefined);
    setCapacity(undefined);
    setColor(undefined);
  };

  const add = () => {
    if (!target || duplicate || wouldExceedStores || rows.length >= 24) return;
    onAdd(target);
    resetProduct();
  };

  return (
    <section className="panel target-builder">
      <div className="section-heading">
        <div><span className="eyebrow">STEP 01</span><h2>添加监控目标</h2></div>
        <span className="section-note">最多 24 项 / 6 家门店</span>
      </div>
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : (
        <div className="builder-grid">
          <label className="field"><span>地区</span>
            <Select
              value={locale}
              options={REGIONS.map((item) => ({ value: item.locale, label: item.title }))}
              showSearch={searchable}
              onChange={onLocaleChange}
            />
          </label>
          <label className="field"><span>品类</span>
            <Select
              value={category}
              options={CATEGORY_OPTIONS}
              onChange={(value) => { setCategory(value); resetProduct(); }}
            />
          </label>
          <label className="field field-wide"><span>门店</span>
            <Select
              value={storeNumber}
              options={stores}
              placeholder="搜索并选择门店"
              showSearch={searchable}
              onChange={setStoreNumber}
            />
          </label>
          {category === "iphone" ? (
            <>
              <label className="field field-wide"><span>机型</span>
                <Select
                  value={family}
                  options={families}
                  placeholder="选择机型"
                  showSearch={searchable}
                  onChange={(value) => { setFamily(value); setCapacity(undefined); setColor(undefined); }}
                />
              </label>
              <label className="field"><span>容量</span>
                <Select
                  value={capacity}
                  options={capacities}
                  disabled={!family}
                  placeholder="选择容量"
                  onChange={(value) => { setCapacity(value); setColor(undefined); }}
                />
              </label>
              <label className="field"><span>颜色</span>
                <Select
                  value={color}
                  options={colors}
                  disabled={!capacity}
                  placeholder="选择颜色"
                  showSearch={searchable}
                  onChange={setColor}
                />
              </label>
            </>
          ) : (
            <label className="field field-model"><span>型号</span>
              <Select
                value={partNumber}
                options={productOptions}
                placeholder="搜索并选择型号"
                showSearch={searchable}
                onChange={setPartNumber}
              />
            </label>
          )}
          <Button
            className="add-target-button"
            type="primary"
            icon={<PlusOutlined />}
            disabled={!target || duplicate || wouldExceedStores || rows.length >= 24}
            onClick={add}
          >
            {duplicate ? "已添加" : wouldExceedStores ? "门店已达上限" : "添加目标"}
          </Button>
        </div>
      )}
    </section>
  );
}
