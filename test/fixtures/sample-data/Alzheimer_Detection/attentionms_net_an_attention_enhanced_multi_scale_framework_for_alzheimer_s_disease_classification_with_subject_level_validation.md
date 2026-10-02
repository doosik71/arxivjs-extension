# AttentionMS-Net: An Attention-Enhanced Multi-Scale Framework for Alzheimer’s Disease Classification with Subject-Level Validation

Osman Yildiz and Abdulhamit Subasi (2026)

## 🧩 Problem to Solve

MRI 기반 알츠하이머병(AD) 분류 연구들은 종종 거의 완벽한 정확도를 보고하지만, 이러한 결과는 동일한 환자의 상관관계가 높은 슬라이스들이 훈련 및 테스트 세트에 모두 나타나는 '슬라이스 레벨 분할(slice-level splitting)'로 인한 데이터 누수(data leakage)에 의해 과장되는 경우가 많다. 이로 인해 모델은 일반적인 질병 바이오마커를 학습하기보다 환자 개개인의 특징을 암기하게 되어, 실제 임상 환경에서의 일반화 성능을 신뢰하기 어렵게 만든다.

문제의 중요성은 알츠하이머병의 조기 발견이 임상적 개입에 결정적이며, 현재 벤치마크의 신뢰할 수 없는 특성 때문에 이 분야의 연구 진행이 왜곡될 수 있다는 점에 있다. 연구의 목표는 데이터 누수의 직접적인 경험적 증거를 제시하고, 이러한 누수 위험을 줄이는 엄격한 평가 계층을 확립하며, 엄격한 환자(subject-level) 검증 환경에서 향상된 AD 분류 성능을 제공하는 새로운 딥러닝 아키텍처를 제안하는 것이다.

## ✨ Key Contributions

이 연구의 중심적인 직관과 설계 아이디어는 다음과 같다.

1. **데이터 누수(Data Leakage)의 정량화 및 강조**: 이미지 레벨(image-level)과 환자 레벨(subject-level) 데이터 분할 전략을 동일한 모델 아키텍처와 하이퍼파라미터를 사용하여 비교함으로써, 데이터 누수가 약 19%p의 정확도 감소를 유발함을 직접적으로 입증하였다. 이는 기존 벤치마크의 신뢰성을 의심하게 하는 중요한 증거이다.
2. **엄격한 평가 계층 제안**: 평가 편향을 점진적으로 줄이고 임상적 실제에 더 가깝게 반영하는 세 가지 수준의 평가 계층(이미지 분할을 통한 슬라이스 레벨, 환자 분할을 통한 슬라이스 레벨, 예측 집계를 통한 환자 레벨)을 도입하였다.
3. **AttentionMS-Net 아키텍처 개발**: Convolutional Block Attention Module (CBAM)의 채널-공간 어텐션(channel-spatial attention) 메커니즘과 EfficientNet-B3의 중간 계층에서 추출한 다중 스케일 특징(multi-scale feature) 통합을 결합한 AttentionMS-Net을 제안하였다. 이 아키텍처는 두 구성 요소가 상호 보완적으로 작용하여 성능을 향상시킨다는 점을 ablation study를 통해 입증하였다. 특히, 어텐션과 다중 스케일 특징의 결합이 제한된 의료 영상 데이터 설정에서 어텐션 메커니즘에 대한 건축적 통찰력을 제공한다.
4. **설명 가능한 AI(Explainable AI) 분석**: Grad-CAM++와 SHAP 분석을 통해 모델의 예측 근거를 시각화하고 특징 중요도를 분석하여, 모델이 주로 뇌실 주변 영역에 집중함을 보여주었다.

## 📎 Related Works

**2.1. AD 분류를 위한 딥러닝**

MRI 기반 AD 분류에서는 사전 학습된 CNN 아키텍처를 활용한 전이 학습(transfer learning)이 주요 접근 방식이었다. Shahid et al. [4]는 ResNet152V2와 무작위 분할(random splitting)을 사용하여 OASIS 데이터셋에서 98.35%의 정확도를 달성했으며, Zolfaghari et al. [5]은 앙상블 학습과 이중 CNN을 결합하여 99.06%의 정확도를 보고하였다. 그러나 이들은 환자 수준 검증의 중요성을 강조했음에도 불구하고, 높은 정확도는 종종 이미지 레벨 평가에 의존하여 데이터 누수 위험을 내포한다. 어텐션 메커니즘(CBAM [8])과 다중 스케일 특징 융합(multi-scale feature fusion [9])은 의료 영상에서 개별적으로 사용되었으나, 엄격한 환자 레벨 검증 하에서 이들의 결합 적용은 충분히 탐구되지 않았다. Vision Transformers (ViTs) [10, 11] 및 ConvNeXt [12]와 같은 최신 모델들도 의료 영상 분류에 적용되고 있으나, AD 특정 ViT 연구 [13]도 종종 환자 레벨 검증이 부족하다. 3D CNN과 Video Swin Transformers를 결합한 최근 연구 [14]는 3D 환자 레벨 검증 하에서 92.9% 정확도를 보고하며 진보를 보였지만, 소규모 신경영상 데이터셋에서의 효과는 여전히 미탐구 영역이다.

**2.2. 신경영상에서의 데이터 누수**

Wen et al. [15]은 406편의 논문을 체계적으로 검토하여 광범위한 편향된 평가를 확인하였다. Yagis et al. [6]은 슬라이스 레벨 분할로 인해 30~55%의 정확도 상승이 있음을 보여주었다. Taiyeb Khosroshahi et al. [7]은 44편의 연구를 분석하여 15.9%만이 외부 검증을 포함하고 79.5%가 교란 변수를 통제하지 못했음을 발견했다. 환자 레벨 분할을 사용한 10가지 아키텍처의 최근 평가 [16]에서는 OASIS + ADNI에서 3개 클래스 분류에 대해 63%의 균형 정확도(balanced accuracy)만 달성하여, 엄격한 검증 조건 하에서의 AD 분류가 얼마나 어려운지 보여준다.

**기존 접근 방식과의 차별점:**
본 연구는 기존 연구들이 간과하거나 제대로 다루지 못했던 '데이터 누수' 문제를 정면으로 다루고, 이를 정량적으로 입증하며, 누수 위험이 없는 엄격한 환자 레벨 검증 프로토콜을 제시한다. 또한, 어텐션 메커니즘과 다중 스케일 특징 융합을 결합한 AttentionMS-Net을 제안하고, 이를 엄격한 환자 레벨 검증 하에서 평가하여 기존의 고정확도 보고와는 다른 현실적인 성능을 제공한다. 이는 기존 연구들이 높은 정확도를 보고했음에도 불구하고, 그 결과가 임상적으로 신뢰하기 어려울 수 있다는 비판적 시각을 제시하고, 새로운 벤치마크를 확립하고자 한다.

## 🛠️ Methodology

이 연구의 방법론은 데이터셋 준비, 전처리, 환자 레벨 교차 검증 프로토콜, 제안된 AttentionMS-Net 아키텍처, 훈련 및 평가 절차, 그리고 설명 가능한 AI 분석을 포함한다.

**전체 파이프라인 또는 시스템 구조**
전체 실험 파이프라인은 그림 1에 요약되어 있다. OASIS 데이터셋은 환자 ID 추출 및 10-겹 환자 레벨 교차 검증(CV)을 거친다. AttentionMS-Net은 체계적인 ablation study, 데이터 누수 정량화, 환자 레벨 예측 집계, 그리고 후처리 설명 가능성 분석을 통해 평가된다.

![Figure 1. Complete experimental pipeline. The OASIS dataset undergoes subject ID extraction and 10-fold subject-level CV. AttentionMS-Net is evaluated through systematic ablation with data leakage quantification and explainability analysis.](https://www.mdpi.com/applsci/applsci-16-04338/article_deploy/html/images/applsci-16-04338-g001-550.jpg)

**3.1. 데이터셋**
공개적으로 사용 가능한 OASIS Alzheimer’s Detection dataset [17]을 사용하였다. 이 데이터셋은 347명의 고유한 환자로부터 추출된 86,437개의 2D 축(axial) MRI 슬라이스를 포함한다. 환자 식별자(OAS1\_XXXX)는 파일명에서 정규 표현식을 사용하여 추출되어 적절한 환자 레벨 분할을 가능하게 한다. 원본 데이터셋은 비치매(Non-Demented), 아주 경미한 치매(Very Mild Dementia), 경미한 치매(Mild Dementia), 중등도 치매(Moderate Dementia)의 네 가지 진단 범주를 포함하지만, 중등도 치매 클래스에는 2명의 환자(488개 이미지)만 있어 환자 레벨 교차 검증에서 다중 클래스 분류는 신뢰할 수 없다고 판단하여 이진 분류(비치매 vs. 치매)에 집중하였다.

**3.2. 전처리 및 데이터 증강**
모든 MRI 슬라이스는 $224 \times 224$ 픽셀로 크기 조정되고, 사전 학습된 백본 가중치와의 호환성을 위해 ImageNet 통계치(평균 = [0.485, 0.456, 0.406], 표준편차 = [0.229, 0.224, 0.225])를 사용하여 정규화된다. 훈련 중에는 최적의 것으로 확인된 보수적인 증강 구성이 적용된다: CLAHE (clip limit 2.0, 8x8 타일 그리드, $p=0.5$), 무작위 수평 뒤집기 ($p=0.5$), $\pm15^\circ$ 이내 무작위 회전 ($p=0.5$), 밝기/대비 조정 $\pm10\%$ ($p=0.3$). 검증 및 테스트 중에는 증강이 적용되지 않는다. 모든 증강은 환자 레벨 분할 후 훈련 데이터에만 적용되어, 증강 파이프라인을 통한 데이터 누수를 방지한다. 공격적인 증강(탄성 변형, 가우시안 노이즈, CoarseDropout)은 환자 레벨 성능을 저하시키는 것으로 나타났다.

**3.3. 환자 레벨 10-겹 교차 검증**
그림 2는 이미지 레벨과 환자 레벨 분할 전략의 차이를 보여준다. 모든 분할은 계층화된 10-겹 교차 검증을 사용하여 환자 레벨에서 수행된다. 이미지 대신 환자들이 폴드에 할당되므로, 한 환자의 모든 슬라이스는 오직 하나의 파티션에만 존재한다. 각 훈련 폴드 내에서 10%의 환자는 검증(조기 종료)을 위해 예약된다. 각 테스트 폴드는 약 35명의 환자(8000–10,000개 이미지)를 포함하며, 치매 환자는 모든 폴드에 포함된다. 데이터 누수를 정량화하기 위해, 동일한 모델, 하이퍼파라미터 및 전처리 방식을 사용하여 이미지 레벨 10-겹 CV를 병렬로 수행하여 분할 전략만을 유일한 변수로 분리하였다.

![Figure 2. Image-level vs. subject-level splitting. Image-level splitting causes data leakage by distributing correlated slices from the same subject across sets (~99.9% accuracy). Subject-level splitting ensures complete isolation (~80.8% accuracy), resulting in a gap of ~19 percentage points.](https://www.mdpi.com/applsci/applsci-16-04338/article_deploy/html/images/applsci-16-04338-g002-550.jpg)

**3.4. AttentionMS-Net 아키텍처**
제안된 AttentionMS-Net (그림 3)은 세 가지 구성 요소로 결합되어 있다: 계층적 특징 추출을 위한 사전 학습된 백본, 특징 정제를 위한 채널-공간 어텐션 모듈, 그리고 다양한 공간 해상도에서 병리를 포착하기 위한 다중 스케일 융합 메커니즘이다.

![Figure 3. Architecture of AttentionMS-Net. EfficientNet-B3 extracts features at Layers 4 (96-ch), 6 (232-ch), 7 (384-ch) and the final output (1536-d). CBAM refines the final features through channel and spatial attention. Multi-scale fusion projects intermediate features to 256-d each, concatenated with the CBAM output for a 2304-d classification vector.](https://www.mdpi.com/applsci/applsci-16-04338/article_deploy/html/images/applsci-16-04338-g003-550.jpg)

* **백본**: EfficientNet-B3 [20]를 ImageNet으로 사전 학습한 것을 사용하였다. 이는 우수한 정확도-파라미터 비율(12M 파라미터) 때문에 선정되었다. 최종 컨볼루션 계층에서 1,536차원 특징 벡터를 생성한다.
* **CBAM (Convolutional Block Attention Module)**: 최종 컨볼루션 계층 후에 CBAM [8]을 적용한다. CBAM은 채널 어텐션(Channel Attention) 다음에 공간 어텐션(Spatial Attention)을 순차적으로 수행한다.
  * 주어진 중간 특징 맵 $F$에 대해, 채널 어텐션은 전역 평균 풀링(global average pooling)과 $r=16$의 감소 비율(reduction ratio)을 가진 공유 2계층 MLP 병목을 통해 채널별 가중치를 계산한다.
  * 채널 정제된 특징 $F'$는 공간 어텐션을 통과하는데, 이는 채널 차원에 걸쳐 평균 및 최대 풀링을 적용하고, 결과를 연결한 다음, $7 \times 7$ 컨볼루션과 시그모이드 활성화 함수를 통해 처리한다.
  * 완전한 CBAM 정제는 다음 방정식으로 표현된다.
        $$M_c(F) = \sigma((W_1 \cdot \delta(W_0 \cdot F_{cavg}) + W_1 \cdot \delta((W_0 \cdot F_{cmax})))$$
        $$M_s(F') = \sigma(f_{7x7}([AvgPool(F');MaxPool(F')]))$$
        $$F'' = M_s(F') \otimes F', \text{where } F' = M_c(F) \otimes F$$
  * 요소별 곱셈은 1536개 특징 채널에 걸쳐 분류 관련 공간 패턴을 강조하고 관련 없는 영역을 억제한다.
* **다중 스케일 융합**: AD 변화를 여러 스케일에서 포착하기 위해 EfficientNet-B3의 4계층(96 채널), 6계층(232 채널), 7계층(384 채널)에서 중간 특징을 추출한다. 각 특징은 전역 평균 풀링(global average pooling) 및 256차원으로의 $1 \times 1$ 컨볼루션 투영(projection)을 거친다. 이 세 가지 투영된 벡터는 연결(768차원)되고, 1536차원 CBAM 출력과 결합되어 2,304차원 특징 벡터를 생성한다.
* **분류 헤드**: 2,304차원 벡터는 드롭아웃($p = 0.4$) → 완전 연결 계층(FC, 512) → ReLU → 드롭아웃($p = 0.2$) → 완전 연결 계층(FC, 2) → 소프트맥스(Softmax)를 거쳐 비치매/치매 확률을 생성한다.

**3.5. 클래스 불균형 처리**
3.5:1의 클래스 불균형은 클래스 가중 교차 엔트로피(class-weighted cross-entropy) 손실 함수로 처리된다: $w_c = N/(C \times n_c)$, 여기서 $N$은 총 샘플 수, $C$는 클래스 수, $n_c$는 클래스별 샘플 수이다. 이는 치매 오분류에 약 3.5배 더 큰 페널티를 부여하여 임상적 민감도(sensitivity)를 유지한다.

**3.6. 훈련 프로토콜**
모든 실험은 NVIDIA A100-SXM4-80GB GPU에서 PyTorch (버전 2.1)와 Python 3.10을 사용하여 수행되었다. 모든 모델은 AdamW 옵티마이저 [21] (학습률(lr) = $3 \times 10^{-4}$, 가중치 감쇠(weight decay) = $1 \times 10^{-3}$)와 코사인 어닐링(cosine annealing)을 $1 \times 10^{-6}$까지 적용한다. 최대 50 에폭(epoch) 동안 훈련하며, 검증 F1 매크로(F1 macro) 기반의 조기 종료(patience = 10)를 사용한다. 안정성을 위해 그래디언트 클리핑(max norm = 1.0)이 적용된다. 배치 크기는 128이다.

**3.7. 환자 레벨 예측 집계**
임상 진단은 개별 슬라이스가 아닌 전체 환자를 기반으로 이루어진다. 이를 반영하기 위해, 환자 레벨에서 예측을 집계하는 단계를 도입하였다: 각 테스트 환자에 대해, 모든 슬라이스의 소프트맥스(softmax) 확률 출력을 평균하여 환자당 단일 확률 추정치를 얻는다. 최종 분류는 이 평균값을 0.5에서 임계값 처리하여 결정된다. 평균 확률 집계는 다수결 투표(majority voting)보다 신뢰도 보정(confidence calibration)을 보존하기 위해 선택되었으며, 이는 환자 레벨 AUC-ROC 계산에 의미 있는 값을 제공한다. 이 집계는 모호하거나 정보가 부족한 슬라이스에서 발생하는 노이즈를 줄이고 임상적으로 더 관련성 있는 평가 단위를 제공한다.

**3.8. 설명 가능성 분석**
공간적 해석 가능성을 위해 Grad-CAM++ [22]를 사용하고, 특징 레벨 중요도 분석을 위해 SHAP [23]을 사용하였다. Grad-CAM++는 활성화 맵의 가중 조합을 계산하여 클래스 판별적 히트맵을 생성하고, 분류 결정에 영향을 미치는 뇌 영역을 강조한다. 뇌 조직 경계에서의 아티팩트를 줄이기 위해 Otsu 임계값 처리와 형태학적 침식(morphological erosion)을 사용하여 뇌 실질 마스킹(brain parenchyma masking)을 적용한다. SHAP 값은 학습된 특징 표현의 어떤 차원이 분류에 가장 많이 기여하는지를 식별한다.

## 📊 Results

**4.1. 평가 지표**
10-겹 교차 검증에 대한 평균 $\pm$ 표준편차로 다섯 가지 지표가 보고되었다:

* **정확도(Accuracy)**: 전체 올바른 비율.
* **F1 매크로(F1 Macro)**: 클래스별 정밀도(precision)와 재현율(recall)의 조화 평균을 평균한 값.
* **AUC-ROC**: ROC 곡선 아래 면적으로, 임계값에 독립적인 판별 능력을 측정.
* **민감도(Sensitivity, Demented recall)**: 치매 환자를 올바르게 식별한 비율로, 선별에 중요.
* **특이도(Specificity, Non-Demented recall)**: 비치매 환자를 올바르게 식별한 비율로, 불필요한 후속 조치 감소에 도움.

**4.2. 데이터 누수의 영향**
표 2는 동일한 AttentionMS-Net 아키텍처, 하이퍼파라미터 및 전처리 파이프라인을 사용하여 이미지 레벨과 환자 레벨 10-겹 CV 간의 통제된 비교를 제시한다. 거의 완벽한 이미지 레벨 결과(정확도 99.99%, 민감도 100%)는 슬라이스별 분할이 동일한 환자의 매우 유사한 이미지를 훈련 및 테스트 세트에 모두 포함시킬 수 있음을 보여준다. 이는 모델이 질병 패턴이 아닌 개별 뇌를 인식하게 만든다. 환자 식별 누수(subject identity leakage)가 제거되었을 때, 정확도에서 약 19%p, 민감도에서 38%p 성능이 감소하여 진정한 일반화 능력을 더 정확하게 나타낸다.

**4.3. AttentionMS-Net Ablation Study**
표 3의 ablation study는 엄격한 10-겹 환자 레벨 교차 검증 설정 하에서 아키텍처 수정의 점진적인 효과를 보여준다.

* **베이스라인 EfficientNet-B3 (CE)**: 정확도 0.797을 달성하지만, 상대적으로 낮은 민감도(0.543)를 보여 양성 사례 감지 능력이 제한적임을 시사한다.
* **CBAM + Class Weighting (CW) 추가**: F1 Macro와 민감도를 개선하여 클래스 불균형 처리가 향상되었음을 반영한다. 그러나 정확도는 향상되지 않았고(0.797 유지), AUC-ROC와 특이도는 약간 저하되었다. 이는 어텐션 메커니즘이 347명의 상대적으로 작은 코호트에서 과적합(overfitting)될 수 있음을 시사한다.
* **AttentionMS-Net (Full)**: CBAM과 다중 스케일 특징 융합을 결합한 완전한 AttentionMS-Net 모델은 가장 높은 AUC-ROC (0.873)와 민감도 (0.620)를 포함하여 최고의 전반적인 성능을 달성했다. 이는 구성 요소 간의 상호 보완적인 상호 작용을 확인한다. 어텐션은 가장 판별적인 영역에 집중하고, 다중 스케일 표현은 서로 다른 공간 해상도에서 정보를 포착하여 독립적인 접근 방식으로는 완전히 활용할 수 없는 이점을 제공한다. 통계적으로 유의미한 개선이 확인되었다 ($p = 0.027$).

**4.4. 증강 Ablation Study**
표 4의 증강 ablation study 결과, 공격적인 증강(탄성 변형, CoarseDropout)은 보수적인 증강보다 환자 레벨 AUC (0.906 $\rightarrow$ 0.878)와 정확도 (0.833 $\rightarrow$ 0.804)를 저하시켰다. 보수적인("Mild") 구성이 최고의 전반적인 성능을 달성했으며, 특히 민감도 (0.640 $\rightarrow$ 0.715)를 향상시켰다. 이 결과는 강한 기하학적 왜곡과 드롭아웃 패턴이 자연 영상 분류에는 유익할 수 있지만, 임상 MRI 변동성을 대표하지 않는 분포 변화를 유발할 수 있음을 확인한다.

**4.5. 이전 연구와의 비교**
표 5는 AttentionMS-Net을 OASIS 데이터셋에 대한 이전 연구들과 비교한 결과이다.

* **엄격한 환자 레벨 검증 연구**: Wen et al. [15] 및 Yagis et al. [6]과 같이 적절한 환자 레벨 검증을 채택한 연구들은 61–73% 및 약 65%의 정확도를 보고하여, 엄격한 조건 하에서 현실적인 성능을 반영한다.
* **데이터 누수 위험이 높은 연구**: Shahid et al. [4] 및 Zolfaghari et al. [5]와 같은 연구들은 95–99% 범위의 예외적으로 높은 정확도를 보고했지만, 이는 데이터 누수 위험이 높은 무작위 또는 슬라이스 레벨 분할에 의존했다.
* **AttentionMS-Net**: 82.4%의 정확도와 65.3%의 민감도를 달성하며, 이전의 저위험 접근 방식보다 상당히 개선된 성능을 보여준다. 이는 현실적인 AD 분류가 여전히 어려운 과제임을 확인하는 동시에, 기존의 평가 편향과 관련된 과장된 성능을 피하면서 더 신뢰할 수 있고 임상적으로 의미 있는 벤치마크를 제공한다.

**4.6. 설명 가능성 분석**

* **Grad-CAM++**: 그림 4와 5는 AttentionMS-Net의 뇌 마스킹된 Grad-CAM++ 히트맵을 보여준다. 모델은 주로 해마(hippocampus)보다는 뇌실(ventricular) 경계와 뇌실 주변 백질 영역에 집중하는 경향을 보인다. 뇌실 확장은 전체 뇌 위축(brain atrophy)과 상관관계가 있는 이차적인 바이오마커로 해석될 수 있으며, 이는 초기 AD 병리 자체의 직접적인 국소화라기보다는 간접적인 지표이다. 이러한 뇌실 중심의 초점은 모델이 초기 AD(아주 경미한 치매)에 대한 민감도가 낮은 이유를 부분적으로 설명할 수 있다.

![Figure 4. Brain-masked Grad-CAM++ heatmaps from an intermediate convolutional layer (14 × 14 spatial resolution) for correctly classified samples with confidence ≥0.99. Non-Demented subjects show activation around ventricles and white matter tracts. Demented subjects show focal activation in frontoparietal parenchyma. Warm colors (red/yellow) indicate high model activation; cool colors (blue) indicate low activation.](https://www.mdpi.com/applsci/applsci-16-04338/article_deploy/html/images/applsci-16-04338-g004-550.jpg)

![Figure 5. Detailed Grad-CAM++ comparison for a correctly classified Demented subject (confidence: 1.00). Brain masking suppresses skull-boundary activations, revealing focal attention on periventricular parenchyma. Warm colors (red/yellow) indicate high model activation; cool colors (blue) indicate low activation.](https://www.mdpi.com/applsci/applsci-16-04338/article_deploy/html/images/applsci-16-04338-g005-550.jpg)

* **SHAP 분석**: 그림 6은 특징 레벨의 해석 가능성을 제공한다. 소수의 특징이 판별에 지배적인 역할을 하며, 가장 중요한 특징(Feature 1623)은 높은 활성화 값이 치매 클래스 예측을 유도하고 낮은 활성화 값이 비치매 클래스 예측을 유도하는 강한 비대칭성을 보여준다.

![Figure 6. SHAP feature importance by class. Feature 1623 shows opposing effects across Non-Demented (left) and Demented (right) classifications.](https://www.mdpi.com/applsci/applsci-16-04338/article_deploy/html/images/applsci-16-04338-g006-550.jpg)

**4.7. 환자 레벨 예측 집계**
표 6은 환자 레벨 집계가 모든 지표를 일관되게 개선했음을 보여준다. 한 환자당 약 250개의 슬라이스에 대한 예측을 평균하는 것이 정보가 부족한 슬라이스에서 발생하는 노이즈를 줄여준다. 민감도가 0.609에서 0.653으로 증가($+4.4\%$)한 것은 모델 예측이 주로 슬라이스 레벨 노이즈에 의해 영향을 받으며, 체계적인 오분류 패턴에 의한 것이 아님을 시사한다. 전반적인 성능은 향상되지만, 폴드 간 분산은 증가(민감도 표준편차: 0.146 $\rightarrow$ 0.243)하는데, 이는 약 8,000개의 슬라이스에 비해 폴드당 약 35명의 환자라는 더 작은 샘플 크기 때문에 개별 환자 결과가 폴드 레벨 통계에 더 큰 영향을 미 미치기 때문이다.
상대적으로 낮은 민감도(0.653)는 OASIS 데이터셋에서 이진 AD 분류의 내재적인 어려움을 강조한다. 치매 그룹에는 아주 경미한 치매에서 중등도 치매까지 다양한 환자가 포함되며, 초기 단계 환자는 정상적인 연령 관련 위축과 크게 겹치는 미묘한 구조적 변화를 보인다. 오분류된 사례 분석 결과, 대부분의 오탐(false negatives)이 아주 경미한 치매 사례(CDR 0.5)인 것으로 나타났다.

## 🧠 Insights & Discussion

**강점:**

* **데이터 누수 정량화의 엄격성**: 이 연구는 이미지 레벨 10-겹 교차 검증과 환자 레벨 10-겹 교차 검증을 동일한 모델 및 프로토콜 하에서 비교하여 데이터 누수가 약 19%p의 정확도 감소를 가져옴을 경험적으로 입증하였다. 이는 기존 연구들의 과장된 성능 보고를 비판적으로 재평가하는 데 중요한 기반을 제공한다.
* **체계적인 평가 계층 제안**: 슬라이스 레벨(이미지 분할), 슬라이스 레벨(환자 분할), 환자 레벨(예측 집계)의 3단계 평가 계층을 제시함으로써, 임상적 현실과 더 잘 부합하고 평가 편향을 최소화하는 새로운 표준을 제안한다.
* **AttentionMS-Net의 시너지 효과**: CBAM 어텐션과 다중 스케일 특징 융합이 상호 보완적으로 작용하여 성능을 향상시킨다는 점을 ablation study를 통해 입증하였다. 이는 제한된 의료 영상 데이터에서 딥러닝 아키텍처 설계에 대한 중요한 통찰을 제공한다.
* **설명 가능한 AI 통합**: Grad-CAM++ 및 SHAP 분석을 통해 모델의 예측 근거를 시각적으로, 그리고 특징 중요도 측면에서 설명함으로써, 의료 분야에서 모델의 신뢰성과 해석 가능성을 높였다.

**한계, 가정 또는 미해결 질문:**

* **2D 슬라이스 사용**: 이 연구는 2D 축 슬라이스(axial slices)를 사용하여 3D 체적 데이터(volumetric data)의 이점을 충분히 활용하지 못했다. 이는 슬라이스 간 공간적 상관관계를 놓치고, 해마 위축과 같은 3차원적 AD 바이오마커를 완전히 특성화하기 어렵게 만든다. 3D 모델의 과적합 위험과 계산 효율성 때문에 2D 접근법을 선택했지만, 이로 인해 정보 손실이 발생한다.
* **작은 샘플 크기**: 347명이라는 비교적 적은 수의 환자(subjects)는 다중 클래스 분류의 타당성을 제한하고 (예: 중등도 치매 환자는 2명뿐), 어텐션 메커니즘의 과적합 위험을 증가시킬 수 있다.
* **외부 검증 부재**: 연구에서 제시된 3단계 평가 계층은 OASIS 데이터셋 내에서 내부적으로 검증되었으므로, 다른 데이터셋이나 획득 프로토콜에 대한 전이 가능성(transferability)은 아직 입증되지 않았다.
* **초기 단계 AD의 낮은 민감도**: 모델의 낮은 민감도(0.653)는 치매 그룹 내의 환자 다양성, 특히 초기 단계 AD 환자의 미묘한 구조적 변화가 정상적인 연령 관련 위축과 크게 겹치기 때문이다. Grad-CAM++ 분석 결과 뇌실 영역에 주로 집중하는 경향도 이와 관련될 수 있다.

**논문에 근거한 간략한 비판적 해석 및 논의사항:**
이 연구는 신경영상 기반 AD 분류에서 '데이터 누수'의 심각성을 강력하게 경고하며, 기존의 높은 정확도 보고가 현실을 반영하지 못할 수 있음을 설득력 있게 보여준다. 이는 해당 분야 연구자들이 평가 프로토콜에 대한 엄격함을 최우선으로 고려해야 함을 시사한다. AttentionMS-Net은 기존 접근 방식보다 엄격한 조건 하에서 성능을 개선했지만, 2D 데이터의 한계로 인해 특히 초기 AD 진단에서 민감도가 여전히 도전 과제로 남아 있다. 이는 3D 데이터, 다중 모드 융합(multi-modal fusion) 및 더 큰 데이터셋(예: ADNI)으로의 확장이 필수적임을 의미한다. DeiT-Small과의 비교 결과는 트랜스포머 기반 아키텍처가 CNN보다 항상 우월하지 않으며, 데이터셋 규모가 작을 때는 아키텍처 선택보다 평가 프로토콜의 엄격성이 더 중요하다는 점을 시사한다. 궁극적으로 이 연구는 AD 분류 벤치마크의 신뢰성을 높이는 데 중요한 기여를 하며, 미래 연구의 방향성을 제시하는 데 큰 의미가 있다.

## 📌 TL;DR

이 연구는 MRI 기반 알츠하이머병(AD) 분류에서 '데이터 누수(data leakage)'의 심각성을 직접적으로 측정하고, 이를 해결하기 위한 엄격한 평가 프로토콜과 새로운 딥러닝 모델인 AttentionMS-Net을 제안한다. 주요 기여 사항은 다음과 같다:

1. 동일한 모델로 이미지 레벨과 환자(subject-level) 레벨 교차 검증을 비교하여 데이터 누수가 약 19%p의 정확도 과장을 유발함을 실증적으로 입증하였다.
2. 데이터 누수를 점진적으로 줄이는 '3단계 평가 계층(slice-level with image splitting, slice-level with subject splitting, subject-level with prediction aggregation)'을 확립하고, 향후 연구에서 환자 레벨 집계 지표를 우선적인 평가 기준으로 삼을 것을 권고한다.
3. 채널-공간 어텐션(CBAM)과 다중 스케일 특징 융합을 결합한 AttentionMS-Net 아키텍처를 제안하였으며, ablation study를 통해 두 구성 요소가 상호 보완적으로 작용하여 성능을 향상시킴을 입증하였다. 또한, Grad-CAM++ 및 SHAP 분석을 통해 모델의 예측 근거를 설명하였다.

이 연구는 기존 AD 분류 벤치마크의 신뢰할 수 없는 특성을 강조하고, 방법론적으로 엄격한 기준을 확립하여 실제 임상 적용을 위한 더 현실적이고 일반화 가능한 모델 개발에 기여한다. 향후 연구는 3D 체적 데이터 및 다중 모달 융합을 통해 초기 AD 진단 민감도를 더욱 높일 가능성이 있다.
